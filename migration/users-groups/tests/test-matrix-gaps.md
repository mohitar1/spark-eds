# Test Matrix Gaps

Asset/user combos from `tccc-authz-test-matrix.csv` that cannot be tested with real AEM data.

## Untestable combos

### Restricted brand + customer "accessible" case

Nestea is the only restricted brand appearing on McDonalds customer assets.
The Nestea CUG (244 members) and McDonalds customer CUG (97 members) have **zero overlap** — no real user is in both groups. Only admins can access C4 (`1aa7d2c8`, nestea + US + McDonalds). This means we can verify the **blocking** behavior (non-admin gets "not accessible") but cannot test the "accessible" path for a non-admin user with both Nestea CUG + McDonalds customer.

### Restricted brand + IBC=none

CSV column 2: "restricted / IBC: none / Customer: none". The only real asset matching this profile (`63015722`) is **deactivated** in AEM. No active asset has a restricted brand with IBC=none.

### Restricted brand + IBC=Spain + Customer=McDonalds

CSV column 9: "restricted / IBC: Spain / Customer: McDonalds". No real asset exists with this combination in AEM.

### Aloe Gloe + McDonalds

Aloe Gloe restricted brand assets only exist as US templates. No Aloe Gloe asset has McDonalds as intended customer.

## Possible solutions

- **Create test assets in AEM** with the missing combos (restricted brand + IBC=none, restricted brand + Spain + McDonalds)
- **Add a test user to both Nestea CUG and McDonalds CUG** to test the restricted brand + customer "accessible" path
- **Use Aloe Gloe** instead of Nestea for future restricted-brand-with-customer tests (Aloe Gloe CUG has more test users)
