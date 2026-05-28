# Active Household controller owns signed-in Household resources

The app has had repeated lifecycle bugs because route code participated directly in opening, replacing, syncing, and closing active Household database resources. We introduced an app-owned Active Household controller for the signed-in session, activated eagerly from `app/(app)/_layout.tsx` through an Active Household provider. The controller owns cached/fresh Household Session loading, active Household dependency composition, sync coordinator lifecycle, cached-to-fresh replacement, close/delete policy, and sign-out cleanup integration; screens borrow controller state and actions and must not open or close Household DB resources directly.

The controller is Household-wide, not List-singleton-shaped. The Household Session is app-shell state only: active Household, active Member, Members, and Household DB connection metadata. Current List is selection state only. List and Item data loads separately by explicit List ID through List and Item services after active Household context exists.

## Consequences

- `app/(app)/_layout.tsx` is the signed-in product-provider boundary that eagerly activates the Active Household controller.
- The Active Household provider exposes snapshots/actions from the controller to screens and centralizes sign-out order: track `user_signed_out`, reset analytics, dispose active Household controller, clear cached Household metadata/local DB files, then call Clerk `signOut()`.
- Cached List UI may remain visible and writable while fresh authorized active Household resources are prepared, as long as the cached Household is still plausibly authorized. The controller must not close published active Household resources until a replacement has been published and in-flight operations have drained.
- If a fresh Household Session proves the cached Household is unauthorized, the controller stops accepting writes against the cached resource set, disposes it, deletes cached metadata/local DB files for that Household, and publishes loading/error/fresh state instead of keeping stale Household data visible.
- Cached and fresh opens may create separate active Household resource sets and sync coordinators, while the Active Household controller remains the continuous app-level owner.
- Home currently selects `DEFAULT_LIST_ID` and loads that List by calling `getList({ listId })` and `listItems({ listId })` after active Household context exists. Item operations pass the same explicit `listId`.
