# Your bakery order app is ready

I made a simple order book for your phone. It is one file: **index.html**.

## What it does

- **+ New order** button: you can paste the customer's WhatsApp message, then fill in their name, number, the cake, size, flavour, the writing on the cake, the date and time, pickup or delivery, the price and how much they've paid. Only the name, the cake and the date are required.
- **Upcoming** tab: your orders sorted into **Late**, **Today**, **Tomorrow**, **Next 7 days** and **Later**, so you can see what to bake. Each order shows whether it is "To make" or "Ready" and how much the customer still owes. There's a search box to find a customer or cake.
- **Tap an order** to see everything about it. From there you can:
  - Mark it **Ready**, **Handed over** or **Paid in full** with one tap
  - Open **WhatsApp** with a message already written for you: the order details, "it's ready", or a payment reminder. You can change the message before you press send.
  - Use **Order again (copy)** for repeat customers
- **Finished** tab: past and cancelled orders, grouped by month.
- **Money** tab: what you took in orders this week and this month, how much you've been paid, and **who still owes you**. This is also where you set your bakery name, money symbol (₹, £, $…) and country calling code.

## One important thing: backups

Your orders are saved **only on your phone, in the browser**. Nothing is sent anywhere. That's private, but if you clear your browser data or lose your phone, the orders are gone. So:

- Go to **Money → Save backup file** every week or so, then send that file to yourself on WhatsApp or by email.
- The app shows a reminder on the main screen if you haven't saved a backup in 7 days.
- **Restore from a backup file** brings your orders back, for example on a new phone.

## How to get it on your phone

The app has to be opened from a web address so your phone keeps the saved orders. The easiest way:

1. On a computer, go to **app.netlify.com/drop** (free) and drag this folder onto the page. You'll get a web address. You only need to upload the app; your orders never go there.
2. Open that address on your phone in Chrome (Android) or Safari (iPhone).
3. Use **Add to Home screen** in the browser menu so it opens like an app.

If a friend or family member is good with computers, they can do this for you in about 5 minutes. To try it on a computer first, open a terminal in this folder, run `python3 -m http.server`, and visit http://localhost:8000.

## Choices I made for you

- Order steps are: **To make → Ready → Handed over**, plus **Cancelled**.
- The money symbol starts out blank; set yours in the Money tab.
- If a customer's number has no `+` in front, the app adds your country code from the Money tab so the WhatsApp buttons work.

## What I checked

I tested it in a phone-sized browser. I added orders and tried the "fill in the required fields" warning. I marked orders ready, paid and handed over, and checked search and the totals. I checked the WhatsApp links. I also saved a backup, wiped the orders, restored them and reloaded the page. Everything worked with no errors.

I **haven't** tried it on a real phone or sent a real WhatsApp message, so do one test order first.
