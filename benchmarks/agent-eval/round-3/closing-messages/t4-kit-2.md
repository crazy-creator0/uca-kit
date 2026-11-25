# Your cake order book is ready

I built a small order app for your home bakery. It is one file, **index.html**, and you use it in your phone's web browser.

## What it does
- **+ New order**: the big button at the bottom. Fill in the customer's name, the cake, the date and time, what to write on the cake, pickup or delivery, the price and the advance paid. There's also a Notes box where you can paste the customer's WhatsApp message.
- **Coming up**: your orders sorted by day, with today highlighted. Any order that is past its date and not handed over shows at the top in red under "Late". Each order shows the writing for the cake and how much money is still to collect.
- **Tap an order** to move it along: Order taken, Baking, Ready, then Picked up or Delivered. From there you can also:
  - **Message on WhatsApp**: opens WhatsApp with a ready-made message, like "your cake is ready for pickup, balance to pay ₹700". You can change the text before you send it.
  - **Mark fully paid**, **Edit**, **Copy as a new order** (handy for repeat customers), **Cancel** or **Delete**.
- **Finished**: handed-over and cancelled orders, grouped by month, with what you earned each month.
- **Search** by name, cake or phone number.
- At the top, one line shows how many orders you have in the next 7 days, what they're worth and how much is still to collect.

## Important: your orders are stored only on your phone
The app saves orders inside your phone's browser. Nothing goes to the internet. That also means that if you clear your browser data or lose your phone, your orders are gone. So once a week, open **Backup & settings** at the bottom and tap **Save backup file**. Then keep that file safe, for example by sending it to yourself on WhatsApp or putting it in Google Drive. **Restore from backup file** brings the orders back, on this phone or a new one.

## Choices I made for you (you can change them)
- The money sign is **₹** and the phone country code is **91**. A 10-digit number gets +91 added for WhatsApp. If a number starts with + (for example +44), it's used as it is. You can change both in **Backup & settings**, along with your bakery name.
- I left out **reminders/notifications**: they need a server or app permissions. Your "Today" and "Late" sections do that job instead.
- I left out **photos of cake designs**: they would quickly fill up the browser's storage. Keep them in WhatsApp and write a note in the order instead.

## How to get it onto your phone
You need someone to put the app's file on a free website host, such as GitHub Pages or Netlify. Open that web address on your phone, then use the browser menu and choose **Add to Home screen**. It will then open like an app. Your orders still stay only on your phone, not on the website. Opening the file straight from your phone's Downloads may not work, or may not save properly, so a web address is the reliable way.

## What I checked
I ran the app in a test browser at phone size and went through your day: adding orders (including a long pasted WhatsApp message mixing English and Hindi), mistakes in the form, Late/Today/later days, moving an order to Ready, the WhatsApp message and number, marking paid, Picked up moving to Finished, search, closing and reopening, and backup and restore on a second "phone". All 24 checks passed. I also looked at screenshots and fixed a red that was too faint to read easily.

**Not checked:** I didn't test on a real iPhone or Android phone, and I didn't actually open WhatsApp (there was no internet here). Please try these three things once:
1. Add a test order with your own number and tap **Message on WhatsApp**. WhatsApp should open with the message filled in.
2. Tap **Save backup file** and check that the file appears in your Downloads.
3. Close the browser, open the app again, and check that the order is still there. Then delete the test order.

## Files
- `index.html`: the whole app.
- `.uca-workspace/check.cjs`: my test script (you don't need it).
- `.gitignore`: tells Git to skip that test folder.

I didn't set up Git (version history), because I was asked not to use it here. If you'd like a safety copy of each change in future, I can set that up.
