# Route states (M9 sweep)

Every screen in AGENTS.md section 16, with its loading, empty and error states. Every route is also
checked at 390px (no sideways scroll, no axe WCAG 2.1 A/AA violations) by the e2e test
"every route fits a 390px phone".

| Route                     | Loading                                      | Empty / nothing-to-do                                                 | Error                                                        |
| ------------------------- | -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `/`                       | Skeleton page                                | "More drops" hidden when there is only one drop                       | "We couldn't load the drop." + Try again                     |
| `/drop`                   | Skeleton page                                | Upcoming drop; "Sold out · Join waitlist"                             | Same shared error + Try again                                |
| `/quest`                  | Skeleton while the game loads                | "You have used all your tries for today."                             | Shared error + Try again; failed actions show a toast        |
| `/checkout`               | Skeleton page                                | "Win a slot first." + Play to unlock                                  | Toast (e.g. payments not configured, spending cap)           |
| `/checkout/success`       | "Waiting for payment…" (polls 60 s)          | "Still waiting for the payment." + simulate (demo)                    | "Payment not completed." / "Payment refunded."               |
| `/reveal/[id]`            | Skeleton page                                | "This box isn't in your collection."                                  | Shared error + Try again                                     |
| `/collection`             | Skeleton page                                | "No boxes yet" / "Sign in to see your boxes."                         | Shared error + Try again                                     |
| `/trades`                 | Skeleton page                                | "Nothing to trade yet." / "Trading has closed."                       | Shared error + Try again                                     |
| `/verify/[campaign]`      | Skeleton page                                | Fingerprint only until preorders close                                | "Check the draw yourself" error + retry                      |
| `/market`                 | Skeleton page                                | "No listings yet" / "Nothing matches those filters" + Clear filters   | "The marketplace didn't load." + Try again                   |
| `/market/[id]`            | Skeleton page                                | "This listing isn't available." / "Sold out" / "This is your listing" | "The listing didn't load." + Try again                       |
| `/sell`                   | Skeleton page                                | "Verify to start selling" / "No listings yet"                         | "Your seller dashboard didn't load." + Try again             |
| `/sell/new`               | Skeleton page                                | "Verify to start selling" gate                                        | "This draft didn't load."; upload errors inline              |
| `/orders`                 | Skeleton page                                | "No boxes bought yet" / "No sales yet"                                | "Your orders didn't load." + Try again                       |
| `/orders/[id]`            | Skeleton page; "Waiting for payment" polling | "This order isn't yours." / "This order expired"                      | "The order didn't load." + Try again                         |
| `/orders/[id]/chat`       | Skeleton page                                | "No messages yet." / "Chat opens after payment"                       | "The chat didn't load."; polling errors inline               |
| `/me/verify`              | Skeleton page                                | Sign-in prompt                                                        | "Your verification status didn't load." + Try again          |
| `/partners`               | Skeleton page                                | "Sign in to apply" / application status                               | "We couldn't load your application." + Try again             |
| `/partner`                | Skeleton page                                | "You're not a partner yet" / "No campaigns yet"                       | "Partner dashboard" error + Try again                        |
| `/partner/campaign/[id]`  | Skeleton page                                | New draft form                                                        | "This campaign doesn't exist or isn't yours."                |
| `/studio`                 | Skeleton page                                | "No applications yet." / "No reports."                                | "Admin console" / "Studio numbers didn't load." + Try again  |
| `/me`, `/login`, `/terms` | Skeleton page (`/me`)                        | Signed-out prompt                                                     | Toast with the reason (wrong password, locked, rate limited) |
