# Restaurant POS - Windows Desktop

A Windows `.exe` version of the restaurant system, for the counter laptop. Same Firebase
database as the mobile app, the Rider app and the website - orders, menu and prices all
stay in sync automatically.

## What it does

- **Live Orders** - new orders (from the app, website, or this laptop) appear instantly,
  with a sound alert and a banner until you view them. Shows rider delivery status too.
- **POS Billing** - full counter billing: dine-in (pick a table), takeaway, delivery.
  Variants, add-ons, discount, tax, service charge, change due.
- **Slip printing** - prints to any printer connected to the laptop (thermal or A4).
  Set the default printer and paper width once in Settings.
- **Menu & Prices** - add/edit items and categories, change prices inline, mark items
  unavailable. Changes appear on the website and the mobile app immediately.
- **Sales Reports** - today/yesterday/7 days/30 days/this month or a custom date range;
  total sales, profit estimate, tax, discounts, top-selling items, breakdown by payment
  method, order type, and Restaurant vs Website. Exports to CSV.

## Login

Same email and password as the mobile app (the restaurant owner/staff account).

## Building the installer (no computer needed - GitHub does it)

1. Upload this `RestaurantDesktop` folder's contents to a new GitHub repository (same way
   you did for the Rider app) - the `app`, `build`, `.github` folders and the root files
   should sit at the top of the repo.
2. GitHub Actions builds automatically on push (Windows machine, so it can't be built on
   Termux/Android directly - GitHub does the Windows part for you).
3. Go to the repo's **Actions** tab, open the latest run, and download
   **Restaurant-POS-Windows-Installer** from Artifacts.
4. Unzip it on the restaurant's Windows laptop, run the `.exe` installer, and open
   "Restaurant POS" from the Start Menu / Desktop shortcut it creates.

## Notes

- Works like a normal Windows app (not a browser tab) - has its own icon, its own window,
  and remembers your login between launches.
- If the laptop briefly loses internet, the window keeps working and reconnects
  automatically (Firestore's own offline cache) - a fully offline queue like the mobile
  app's isn't included in this first version.
- To change which printer or paper width is used, or turn the new-order sound on/off, go
  to **Settings** inside the app.
