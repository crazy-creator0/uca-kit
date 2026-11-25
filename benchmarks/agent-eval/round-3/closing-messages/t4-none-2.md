# Your bakery order app is ready

I made a simple order book for your phone. It is one file, `index.html`, and it opens in your phone's web browser. You don't need an account, a password or an internet connection to use it.

## What it does

- **Orders screen:** shows every order that isn't finished yet, grouped into **Overdue**, **Today**, **Tomorrow**, **Next 7 days** and **Later**. Orders whose date has passed but haven't been collected show in red at the top.
- **+ New order:** a short form with the customer's name, WhatsApp number, the cake, size/flavour/decoration, the writing on the cake, pickup or delivery (with address), date and time, price, money paid so far and notes (allergies, candles and so on). You must fill in the name, the cake and the date. Everything else is optional.
- **Tap an order** to see it all, then:
  - Move it along one tap at a time: **New → Confirmed → Baking → Ready → Collected**.
  - **Mark fully paid** when the rest of the money comes in.
  - **WhatsApp: order details** opens WhatsApp with a confirmation message already written (cake, writing, date, price, what's left to pay). **WhatsApp: it's ready** opens a "your cake is ready" message. You can change the text before you press send. The app never sends anything by itself.
  - **Order again** starts a new order with the same customer and cake, for repeat customers.
  - **Edit**, **Cancel** (you can undo this later) or **Delete for good** (it asks you first).
- **Done screen:** collected and cancelled orders, with a search box.
- **Money screen:** for this week and this month it shows the number of orders, their total value, the money received and the money still to collect, plus a list of customers who still owe you.
- **Settings:** your bakery name (it goes at the end of your WhatsApp messages), your money symbol and your country calling code.

## Set these up first (one minute)

Open **Settings** and fill in:
1. **Bakery name**
2. **Money symbol**, such as £, $, € or ₹. I left it blank because I don't know your country.
3. **Country calling code**, such as 44 for the UK. With this set, you can type numbers the way you normally do, like 07700 900123, and the WhatsApp buttons will still open the right chat.

## Important: back up your orders

Your orders are saved **only inside the browser on your phone**. If you lose the phone or clear the browser's data, they're gone. About once a week, open **Settings → Save backup file** and send that file to yourself on WhatsApp or by email. The app shows a reminder if you haven't backed up in 7 days.
To get your orders back, use **Restore from backup file**. It adds the orders from the file and keeps the ones already on the phone.

## How to get it onto your phone

The most reliable way is to put the file on a free website-hosting service. For example, on a computer go to Netlify Drop (app.netlify.com/drop) and drag this folder onto the page. You'll get a web address. Open that address on your phone, then choose **Add to Home screen** in the browser menu so it opens like an app. Your orders stay on your phone and are not uploaded to the website.

You can also copy `index.html` to the phone and open it from your Files app. Some phones don't keep saved data properly for files opened this way, though, so the website way is safer. Always use the same browser on the same phone, because each browser keeps its own copy of your orders.

## Choices I made for you

- Orders are sorted by their **pickup/delivery date**, and the money totals are counted by that date too. Cancelled orders aren't counted.
- The week runs **Monday to Sunday**.
- Only you use it, on one phone. It doesn't sync between devices.

## What I checked

I tested it on a phone-sized screen in a browser: adding, editing, moving an order through every step, marking it paid, cancelling, deleting, searching, the money totals, the WhatsApp links (local and international numbers), and saving and restoring a backup. Everything worked with no errors. I couldn't test it on a real phone or with the real WhatsApp app, so give the WhatsApp buttons a try with your own number first.

## What could go wrong

- **Lost orders:** if the browser's data is cleared and you have no backup, the orders are gone. Back up regularly.
- **Wrong WhatsApp chat:** if the country code in Settings is wrong, the WhatsApp buttons may open the wrong chat or fail to open one. Typing a number with a + at the front, like +44 7700 900123, always works.
