# End-to-End Login + Checkout Flow

Automate a complete purchase journey from authentication through checkout using session persistence and natural language test assertions.

## Prerequisites

- Node.js 18+
- CBrowser installed: `npm install -g cbrowser`
- Target application running at `https://shop.example.com`

## Step 1: Authenticate and Save Session

Log in once and persist the authenticated session for reuse across tests.

```bash
# Navigate to the login page and authenticate
npx cbrowser navigate "https://shop.example.com/login"

# Fill credentials and submit (CBrowser uses AI to find form fields)
npx cbrowser act "Enter username 'testuser@example.com' and password 'secure123', then click Sign In"

# Save the authenticated session for later reuse
npx cbrowser session save logged-in
```

## Step 2: Define the Test Suite

Create a file called `checkout-flow.test.nl` with natural language test steps:

```text
suite: Checkout Flow
session: logged-in

test: Add item to cart
  navigate to https://shop.example.com/products
  click on the first "Add to Cart" button
  assert the cart badge shows "1"

test: Update cart quantity
  navigate to https://shop.example.com/cart
  change the quantity of the first item to 2
  assert the subtotal updates to reflect 2 items

test: Apply discount code
  type "SAVE10" into the discount code field
  click "Apply"
  assert a discount line item appears showing 10% off

test: Complete checkout
  click "Proceed to Checkout"
  assert the shipping address form is visible
  select "Standard Shipping"
  click "Place Order"
  assert the page shows "Order Confirmed"
  assert an order number is displayed
```

## Step 3: Run the Test Suite

```bash
npx cbrowser test-suite checkout-flow.test.nl
```

## Expected Output

```
CBrowser Test Suite: Checkout Flow
Session: loaded "logged-in" (authenticated as testuser@example.com)

  [PASS] Add item to cart (3.2s)
    - Navigated to /products
    - Clicked "Add to Cart" on "Wireless Headphones"
    - Cart badge updated to "1"

  [PASS] Update cart quantity (2.1s)
    - Navigated to /cart
    - Changed quantity from 1 to 2
    - Subtotal updated: $49.98

  [FAIL] Apply discount code (4.5s)
    - Typed "SAVE10" into discount field
    - Clicked "Apply"
    - ASSERTION FAILED: Expected discount line item showing 10% off
      Actual: Error message "Code expired" displayed

  [PASS] Complete checkout (5.8s)
    - Clicked "Proceed to Checkout"
    - Shipping address form visible
    - Selected "Standard Shipping"
    - Clicked "Place Order"
    - Order confirmed: #ORD-20260203-7842

Results: 3 passed, 1 failed (15.6s)
```

## Tips

- Sessions expire based on the target app's cookie lifetime. Re-run the save command if tests start failing on auth.
- Add `--headed` to watch the browser execute each step: `npx cbrowser test-suite checkout-flow.test.nl --headed`
- Combine with visual regression to catch UI changes during checkout.

## Next Steps

- Add edge-case tests: empty cart checkout, invalid payment, out-of-stock items.
- Integrate into CI with `npx cbrowser test-suite checkout-flow.test.nl --ci --reporter json`.
- Layer on persona testing to verify the flow works for different user types.
