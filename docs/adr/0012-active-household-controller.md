# Active Household controller owns signed-in Household resources

The app has had repeated lifecycle bugs because route code participated directly in opening, replacing, syncing, and closing active Household database resources. We will introduce an app-owned Active Household controller singleton for the signed-in session, activated eagerly from `app/(app)/_layout.tsx` through an Active Household provider. The controller owns cached/fresh Household Session loading, the active HouseholdStore, List/Item service composition, the Current List data source, sync coordinator lifecycle, cached-to-fresh replacement, close/delete policy, and sign-out cleanup integration; screens borrow controller state and actions and must not open or close Household DB resources directly.

The controller is Household-wide, not List-singleton-shaped. The Current List is selection state inside the active Household: the first implementation may load only the initial Current List from the Household Session, but the controller shape must not imply that a Household owns only one List. Future List switching should replace Current List state/data sources while reusing the active Household resource graph where possible.

## Considered Options

- **Keep Home-owned composition.** Rejected because Home is only the first signed-in route while the app is under development, and tying Household resource ownership to that screen encourages future screens to duplicate DB lifecycle policy.
- **Use a raw global database singleton.** Rejected because the app needs a signed-in Household controller that owns a coherent resource graph, not a globally reachable DB handle with unclear authorization, sync, replacement, and close semantics.
- **Let the authenticated provider own all resource details.** Rejected because the provider should bridge React subscription/auth inputs to the controller; low-level cached/fresh replacement and close policy belongs in the controller where it can be serialized and tested without UI mounting behavior.

## Consequences

- `app/(app)/_layout.tsx` becomes the signed-in product-provider boundary that eagerly activates the Active Household controller.
- The Active Household provider exposes snapshots/actions from the controller to screens and centralizes sign-out order: track `user_signed_out`, reset analytics, dispose active Household controller, clear cached Household metadata/local DB files, then call Clerk `signOut()`.
- Cached Current List UI may remain visible and writable while fresh authorized resources are prepared, as long as the cached Household is still plausibly authorized. The controller must not close a published data source until a replacement has been published and in-flight operations have drained.
- If fresh bootstrap proves the cached Household is unauthorized, the controller stops accepting writes against the cached resource set, disposes it, deletes cached metadata/local DB files for that Household, and publishes loading/error/fresh state instead of keeping stale Household data visible.
- Cached and fresh opens may create separate resource sets and sync coordinators, while the Active Household controller remains the continuous app-level owner.
