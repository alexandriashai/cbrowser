"""
A linear mixed model with crossed random intercepts, fitted by REML, with
Satterthwaite degrees of freedom for a fixed-effect contrast.

    y = X beta + Zp a + Zs b + e,  a ~ N(0, sp2 I_P), b ~ N(0, ss2 I_S), e ~ N(0, s2 I_n)

The model of Study 2's Analysis 2a, NASA_TLX ~ CTC + (1 | participant) +
(1 | stimulus), and of Study 3's within-subgroup analysis. Written here because
this environment has no statsmodels or lme4; it follows lme4's REML criterion
and lmerTest's Satterthwaite method (Kuznetsova, Brockhoff & Christensen 2017,
J Stat Softw 82(13)).

REML, profiled over s2, with gamma = (sp2, ss2) / s2, H = I + Z Gamma Z':
  -2 l_R = (n - p) log(r'H^-1 r / (n - p)) + log|H| + log|X'H^-1 X| + const
H^-1 and log|H| come from Woodbury with M = Gamma^-1 + Z'Z (q x q, q = P + S),
so no n x n matrix is ever formed. The criterion is minimised over log gamma.

Satterthwaite: for a contrast c, f(theta) = c'(X'V^-1 X)^-1 c with
theta = (sp2, ss2, s2); df = 2 f^2 / (g' A g), g = grad f, A = 2 H_dev^-1, where
H_dev is the Hessian of the unprofiled REML deviance at the estimate (both by
central differences). A variance component estimated at the boundary (gamma below
1e-8) is held at zero and dropped from theta, as a singular fit has no curvature
in that direction.

The test of correctness is lmm_selftest(): on complete, balanced, fully crossed
data with a stimulus-level predictor the REML t equals the t of OLS on stimulus
means and the Satterthwaite df equals S - 2 (Westfall, Kenny & Judd 2014), so
the fitter must reproduce both.

@copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
@license MIT
"""

import numpy as np
from scipy import linalg, optimize, sparse, stats

LOG_G_BOUNDS = (-20.0, 8.0)
BOUNDARY = 1e-8


class CrossedLMM:
    def __init__(self, pid, sid, P, S):
        pid = np.asarray(pid); sid = np.asarray(sid)
        self.n, self.P, self.S = len(pid), P, S
        q = P + S
        rows = np.concatenate([np.arange(self.n), np.arange(self.n)])
        cols = np.concatenate([pid, P + sid])
        Z = sparse.csr_matrix((np.ones(2 * self.n), (rows, cols)), shape=(self.n, q))
        self.Zt = Z.T.tocsr()
        self.ZtZ = (self.Zt @ Z).toarray()
        self.dp = np.arange(P)
        self.ds = np.arange(P, q)

    def _parts(self, g):
        gp, gs = g
        M = self.ZtZ.copy()
        M[self.dp, self.dp] += 1.0 / gp
        M[self.ds, self.ds] += 1.0 / gs
        cf = linalg.cho_factor(M, lower=True, check_finite=False)
        R = linalg.cho_solve(cf, self.ZtXy, check_finite=False)
        p = self.p
        A = self.XtX - self.ZtXy[:, :p].T @ R[:, :p]
        bv = self.Xty - self.ZtXy[:, :p].T @ R[:, p]
        c = self.yty - self.ZtXy[:, p] @ R[:, p]
        beta = np.linalg.solve(A, bv)
        rwr = c - bv @ beta
        logdetH = self.P * np.log(gp) + self.S * np.log(gs) + 2.0 * np.log(np.diag(cf[0])).sum()
        return A, beta, rwr, logdetH

    def _profiled(self, lg):
        A, _, rwr, logdetH = self._parts(np.exp(lg))
        if rwr <= 0:
            return 1e300
        np_ = self.n - self.p
        return np_ * np.log(rwr / np_) + logdetH + np.linalg.slogdet(A)[1]

    def _deviance(self, theta, free):
        """Unprofiled REML deviance in variance parametrization; components not free are 0 (gamma at BOUNDARY)."""
        sp2, ss2, s2 = self._full(theta, free)
        if s2 <= 0 or sp2 < 0 or ss2 < 0:
            return 1e300
        g = (max(sp2 / s2, BOUNDARY * 1e-3), max(ss2 / s2, BOUNDARY * 1e-3))
        A, _, rwr, logdetH = self._parts(g)
        return (self.n - self.p) * np.log(s2) + logdetH + np.linalg.slogdet(A)[1] + rwr / s2

    def _full(self, theta, free):
        full = np.zeros(3)
        full[free] = theta
        return full

    def fit(self, y, X):
        y = np.asarray(y, float); X = np.asarray(X, float)
        self.p = X.shape[1]
        self.ZtXy = np.asarray(self.Zt @ np.column_stack([X, y]))
        self.XtX = X.T @ X
        self.Xty = X.T @ y
        self.yty = y @ y
        best = None
        for start in ((np.log(0.5), np.log(0.25)), (np.log(0.05), np.log(1.0))):
            r = optimize.minimize(self._profiled, np.array(start), method="L-BFGS-B",
                                  bounds=[LOG_G_BOUNDS, LOG_G_BOUNDS], options={"ftol": 1e-13, "gtol": 1e-9, "maxiter": 400})
            if best is None or r.fun < best.fun:
                best = r
        g = np.exp(best.x)
        A, beta, rwr, _ = self._parts(g)
        s2 = rwr / (self.n - self.p)
        self.gamma, self.beta, self.s2 = g, beta, s2
        self.sp2, self.ss2 = g[0] * s2, g[1] * s2
        self.cov = s2 * np.linalg.inv(A)
        self.converged = bool(best.success)
        return self

    def contrast(self, c):
        """Estimate, SE, t and Satterthwaite df of c'beta."""
        c = np.asarray(c, float)
        est = float(c @ self.beta)
        var = float(c @ self.cov @ c)
        free = [i for i, v in enumerate((self.gamma[0], self.gamma[1])) if v > BOUNDARY] + [2]
        theta0 = np.array([self.sp2, self.ss2, self.s2])[free]

        def fvar(th):
            sp2, ss2, s2 = self._full(th, free)
            g = (max(sp2 / s2, BOUNDARY * 1e-3), max(ss2 / s2, BOUNDARY * 1e-3))
            A, _, _, _ = self._parts(g)
            return s2 * float(c @ np.linalg.solve(A, c))

        h = 1e-4 * theta0
        k = len(theta0)
        grad = np.empty(k)
        for i in range(k):
            e = np.zeros(k); e[i] = h[i]
            grad[i] = (fvar(theta0 + e) - fvar(theta0 - e)) / (2 * h[i])
        H = np.empty((k, k))
        f0 = self._deviance(theta0, free)
        for i in range(k):
            ei = np.zeros(k); ei[i] = h[i]
            H[i, i] = (self._deviance(theta0 + ei, free) - 2 * f0 + self._deviance(theta0 - ei, free)) / h[i] ** 2
            for j in range(i + 1, k):
                ej = np.zeros(k); ej[j] = h[j]
                H[i, j] = H[j, i] = (self._deviance(theta0 + ei + ej, free) - self._deviance(theta0 + ei - ej, free)
                                     - self._deviance(theta0 - ei + ej, free) + self._deviance(theta0 - ei - ej, free)) / (4 * h[i] * h[j])
        try:
            Acov = 2.0 * np.linalg.inv(H)
            denom = float(grad @ Acov @ grad)
            df = 2.0 * var * var / denom if denom > 0 else np.nan
        except np.linalg.LinAlgError:
            df = np.nan
        return est, np.sqrt(var), est / np.sqrt(var), df


def ols_t(X, y, c):
    """OLS t of c'beta and its df (n - p)."""
    XtX_inv = np.linalg.inv(X.T @ X)
    beta = XtX_inv @ X.T @ y
    r = y - X @ beta
    df = len(y) - X.shape[1]
    s2 = r @ r / df
    return float(c @ beta) / np.sqrt(s2 * float(c @ XtX_inv @ c)), df


def lmm_selftest(rng, reps=40, P=60, S=16):
    """Complete crossed data: REML t must equal the means-regression t, and df must equal S - 2."""
    worst_t, worst_df = 0.0, 0.0
    pid = np.repeat(np.arange(P), S); sid = np.tile(np.arange(S), P)
    m = CrossedLMM(pid, sid, P, S)
    used = 0
    for _ in range(reps):
        z = rng.normal(size=S)
        y = 50 + 3 * z[sid] + rng.normal(0, 7, S)[sid] + rng.normal(0, 12, P)[pid] + rng.normal(0, 16, P * S)
        X = np.column_stack([np.ones(P * S), z[sid]])
        m.fit(y, X)
        _, _, t, df = m.contrast([0, 1])
        means = np.bincount(sid, y) / P
        t_ols, df_ols = ols_t(np.column_stack([np.ones(S), z]), means, np.array([0, 1]))
        # The identity needs both components interior; a boundary fit is not the ANOVA solution.
        if min(m.gamma) <= 1e-4:
            continue
        used += 1
        worst_t = max(worst_t, abs(t - t_ols) / abs(t_ols))
        worst_df = max(worst_df, abs(df - df_ols))
    if used < reps // 2 or worst_t > 1e-4 or worst_df > 0.05:
        raise SystemExit(f"LMM self-test failed: {used} interior fits, max rel |t - t_means| {worst_t:.2e}, max |df - (S-2)| {worst_df:.3f}")
    return {"fits": used, "max_rel_t_error": worst_t, "max_abs_df_error": worst_df, "P": P, "S": S}
