# Your bakery order book is ready

I made a simple order book app for your phone. It's built for the way you work: 5 to 20 WhatsApp orders a week, mostly birthday cakes.

## What it does
- **+ New order** (the big button at the bottom): type the customer's name, WhatsApp number, the cake, size, flavour, **the message on the cake**, the date and time, pickup or delivery, the price and how much they have paid so far. Notes is for things like design, allergies and candles.
- **Coming up** lists your orders by day: **Late** (the date has passed and the cake isn't handed over yet), **Today** (highlighted), **Tomorrow**, then later days.
- The message to write on each cake is shown large in a dotted box, so you can check the spelling of the name before you pipe it.
- Each order has one main button that moves it forward: **Start baking**, then **Mark ready**, then **Mark handed over**. Handed-over orders move to the **Handed over** tab with a green tick.
- **WhatsApp** opens WhatsApp with a message already written for you. Before the cake is ready it's an order confirmation: cake, cake message, date, total, paid and balance. Once the cake is ready it's a "your cake is ready" message. You still press send yourself.
- **Money:** every order shows "To collect". The top line shows how many orders you have in the next 7 days and how much money is still to collect overall. **Paid in full** clears the balance with one tap.
- **Search** by name, phone number, cake or message.
- **Edit** lets you change anything, cancel an order (it stays in your records) or delete it (the app asks first).

## Please do these two things first
1. Tap **Settings & backup** and fill in your bakery name, your money sign (for example ₹) and your country code (for example 91). The country code lets the WhatsApp button find a customer whose number you saved without the +.
2. **Save a backup every week** (Settings & backup, then Save backup file), and keep that file somewhere safe, for example send it to yourself. Your orders are stored only on your phone, inside the browser. Clearing the browser's data, or changing phone, will lose them unless you have a backup. **Restore from backup file** brings them back. The app reminds you when you haven't saved a backup for 7 days. The backup file contains your customers' names and numbers, so don't share it.

## How to get it on your phone
The app is three files: `index.html`, `style.css` and `app.js`. It needs no internet and no account, and nothing is sent anywhere.
- **Easiest:** ask someone who is comfortable with computers to put these three files on a free website host. They'll give you a link. Open the link on your phone, then use your browser's menu and choose **Add to Home screen** so it opens like an app.
- You can also open `index.html` straight from your phone's files. It worked that way in my tests on a computer browser, but phone browsers differ, so I can't promise it on your phone.
- Each link or browser keeps its own copy of the orders. If you start using a new link or a new phone, move your orders over with a backup file.

## Choices I made for you
- Order stages are: Order taken, Baking, Ready, Handed over (or Cancelled).
- There are no automatic reminders or notifications. Those would need an online service, so instead the app highlights Today, Tomorrow and Late.
- It's for one person on one phone. If someday a helper needs to see the same orders on their own phone, the app would need an online database. That's a bigger step we could do later.
- The look is a cream "order book" page with a raspberry colour for the main buttons. Each order has a coloured edge for its stage: grey for order taken, amber for baking, blue for ready, green for handed over and red for late. It uses your phone's own fonts, so it works offline.

## What I checked
- **Main task, step by step:** I tested it in a real browser at phone size with an automated script: 33 of 33 checks passed. They covered:
  - adding orders, including a long cake message in Hindi and English, long notes, and prices typed as "1,800" or "Rs. 1,200"
  - missing name or date, wrong amounts, and paying more than the price, each giving a plain message
  - the Late / Today / Tomorrow grouping
  - each stage button, Paid in full, search and editing
  - saving after the page is reloaded
  - saving a backup and restoring it in a fresh browser, plus a broken file giving a plain message
  - WhatsApp links (country code added, or WhatsApp lets you pick the chat if there's no number)
  - no sideways scrolling at phone width
- **Looked at screenshots** at 360 and 320 pixels wide. They showed four problems, all now fixed:
  - the delivery address box appeared even for pickup
  - buttons were cut off on small phones
  - a long bakery name took up too much space
  - the tick looked half drawn (my screenshot caught it mid-animation)
- **Opened straight from the file** (no server): orders saved and were still there after reloading.
- The test script is kept in `.uca-workspace/test.cjs`. The test pictures and test backup files have been deleted.

## What I could not check
- I didn't try it on a real Android phone or iPhone.
- I couldn't open WhatsApp itself (no internet here). I checked only that the WhatsApp links are built correctly.
- The sample orders in my tests were made up by me, not taken from your real orders.

## Try it in one minute
1. Tap **+ New order** and enter a pretend order for tomorrow with a cake message. It should appear under **Tomorrow**, with the message in the dotted box.
2. Tap **Start baking**, then **Mark ready**. The coloured edge changes from grey to amber to blue.
3. Tap **WhatsApp**. WhatsApp should open with a "your cake is ready" message. Don't send it. Then go back, tap **Edit**, and **Delete** the pretend order.
