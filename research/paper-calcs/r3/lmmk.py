"""
REML linear mixed model with any number of random-intercept factors, and
Satterthwaite df for a fixed-effect contrast. The same method as
../r2/lmm.py (CrossedLMM, exactly two factors), generalised so that the redesign
can fit one factor (a page or pair intercept: D2, D3 pooled) or a participant
factor beside many fixed page effects (D4 pooled).

    y = X beta + sum_k Z_k a_k + e,  a_k ~ N(0, s2_k I), e ~ N(0, s2 I)

REML profiled over s2, minimised over log(s2_k / s2); H^-1 and log|H| by
Woodbury with M = Gamma^-1 + Z'Z. Satterthwaite as in lmm.py; a component at the
boundary (ratio below 1e-8) is held at zero.

Checked by selftest(): on random incomplete crossed data with two factors it
reproduces CrossedLMM's estimate, t and df.

@copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
@license MIT
"""

import numpy as np
from scipy import linalg, optimize, sparse

BOUNDS = (-20.0, 8.0)
BOUNDARY = 1e-8


class RandomInterceptLMM:
    def __init__(self, factors):
        """factors: list of (level index array, number of levels), all of length n."""
        self.n = len(factors[0][0])
        self.sizes = [L for _, L in factors]
        rows, cols, off = [], [], 0
        for idx, L in factors:
            rows.append(np.arange(self.n)); cols.append(off + np.asarray(idx)); off += L
        self.q = off
        Z = sparse.csr_matrix((np.ones(len(factors) * self.n), (np.concatenate(rows), np.concatenate(cols))), shape=(self.n, self.q))
        self.Zt = Z.T.tocsr()
        self.ZtZ = (self.Zt @ Z).toarray()
        self.blocks = []
        off = 0
        for L in self.sizes:
            self.blocks.append(np.arange(off, off + L)); off += L

    def _parts(self, g):
        M = self.ZtZ.copy()
        for b, gk in zip(self.blocks, g):
            M[b, b] += 1.0 / gk
        cf = linalg.cho_factor(M, lower=True, check_finite=False)
        R = linalg.cho_solve(cf, self.ZtXy, check_finite=False)
        p = self.p
        A = self.XtX - self.ZtXy[:, :p].T @ R[:, :p]
        bv = self.Xty - self.ZtXy[:, :p].T @ R[:, p]
        c = self.yty - self.ZtXy[:, p] @ R[:, p]
        beta = np.linalg.solve(A, bv)
        rwr = c - bv @ beta
        logdetH = sum(L * np.log(gk) for L, gk in zip(self.sizes, g)) + 2.0 * np.log(np.diag(cf[0])).sum()
        return A, beta, rwr, logdetH

    def _profiled(self, lg):
        A, _, rwr, ld = self._parts(np.exp(lg))
        if rwr <= 0:
            return 1e300
        m = self.n - self.p
        return m * np.log(rwr / m) + ld + np.linalg.slogdet(A)[1]

    def _full(self, theta, free):
        full = np.zeros(len(self.sizes) + 1)
        full[free] = theta
        return full

    def _ratios(self, full):
        s2 = full[-1]
        return [max(v / s2, BOUNDARY * 1e-3) for v in full[:-1]], s2

    def _deviance(self, theta, free):
        full = self._full(theta, free)
        if full[-1] <= 0 or np.any(full < 0):
            return 1e300
        g, s2 = self._ratios(full)
        A, _, rwr, ld = self._parts(g)
        return (self.n - self.p) * np.log(s2) + ld + np.linalg.slogdet(A)[1] + rwr / s2

    def fit(self, y, X):
        y = np.asarray(y, float); X = np.asarray(X, float)
        self.p = X.shape[1]
        self.ZtXy = np.asarray(self.Zt @ np.column_stack([X, y]))
        self.XtX, self.Xty, self.yty = X.T @ X, X.T @ y, y @ y
        k = len(self.sizes)
        best = None
        for start in (np.full(k, np.log(0.5)), np.full(k, np.log(0.05))):
            r = optimize.minimize(self._profiled, start, method="L-BFGS-B", bounds=[BOUNDS] * k,
                                  options={"ftol": 1e-13, "gtol": 1e-9, "maxiter": 400})
            if best is None or r.fun < best.fun:
                best = r
        g = np.exp(best.x)
        A, beta, rwr, _ = self._parts(g)
        s2 = rwr / (self.n - self.p)
        self.gamma, self.beta, self.s2 = g, beta, s2
        self.var_components = g * s2
        self.cov = s2 * np.linalg.inv(A)
        self.converged = bool(best.success)
        return self

    def contrast(self, c):
        c = np.asarray(c, float)
        est = float(c @ self.beta)
        var = float(c @ self.cov @ c)
        k = len(self.sizes)
        free = [i for i in range(k) if self.gamma[i] > BOUNDARY] + [k]
        theta0 = np.concatenate([self.var_components, [self.s2]])[free]

        def fvar(th):
            g, s2 = self._ratios(self._full(th, free))
            A, _, _, _ = self._parts(g)
            return s2 * float(c @ np.linalg.solve(A, c))

        h = 1e-4 * theta0
        m = len(theta0)
        grad = np.empty(m)
        for i in range(m):
            e = np.zeros(m); e[i] = h[i]
            grad[i] = (fvar(theta0 + e) - fvar(theta0 - e)) / (2 * h[i])
        H = np.empty((m, m))
        f0 = self._deviance(theta0, free)
        for i in range(m):
            ei = np.zeros(m); ei[i] = h[i]
            H[i, i] = (self._deviance(theta0 + ei, free) - 2 * f0 + self._deviance(theta0 - ei, free)) / h[i] ** 2
            for j in range(i + 1, m):
                ej = np.zeros(m); ej[j] = h[j]
                H[i, j] = H[j, i] = (self._deviance(theta0 + ei + ej, free) - self._deviance(theta0 + ei - ej, free)
                                     - self._deviance(theta0 - ei + ej, free) + self._deviance(theta0 - ei - ej, free)) / (4 * h[i] * h[j])
        try:
            denom = float(grad @ (2.0 * np.linalg.inv(H)) @ grad)
            df = 2.0 * var * var / denom if denom > 0 else np.nan
        except np.linalg.LinAlgError:
            df = np.nan
        return est, np.sqrt(var), est / np.sqrt(var), df


def selftest(rng, reps=30):
    """Two factors on incomplete data must match CrossedLMM (../r2/lmm.py) in t and df."""
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "r2"))
    sys.dont_write_bytecode = True
    from lmm import CrossedLMM
    worst_t = worst_df = 0.0
    P, S, k = 40, 30, 16
    for _ in range(reps):
        counts = np.zeros(S); rows = []
        for _p in range(P):
            pick = np.lexsort((rng.random(S), counts))[:k]; counts[pick] += 1; rows.append(pick)
        pid = np.repeat(np.arange(P), k); sid = np.concatenate(rows)
        z = rng.normal(size=S)
        y = 50 + 3 * z[sid] + rng.normal(0, 7, S)[sid] + rng.normal(0, 12, P)[pid] + rng.normal(0, 16, len(pid))
        X = np.column_stack([np.ones(len(pid)), z[sid]])
        a = CrossedLMM(pid, sid, P, S).fit(y, X)
        b = RandomInterceptLMM([(pid, P), (sid, S)]).fit(y, X)
        if min(a.gamma) < 1e-4:
            continue
        _, _, ta, dfa = a.contrast([0, 1]); _, _, tb, dfb = b.contrast([0, 1])
        worst_t = max(worst_t, abs(ta - tb) / abs(ta)); worst_df = max(worst_df, abs(dfa - dfb))
    if worst_t > 1e-4 or worst_df > 0.05:
        raise SystemExit(f"lmmk self-test failed: max rel t diff {worst_t:.2e}, max df diff {worst_df:.3f}")
    return {"max_rel_t_diff_vs_CrossedLMM": worst_t, "max_df_diff_vs_CrossedLMM": worst_df, "reps": reps}
