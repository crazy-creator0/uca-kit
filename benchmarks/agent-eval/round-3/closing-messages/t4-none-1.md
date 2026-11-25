# Your bakery order app is ready

I made a simple order book for your phone. It opens in a web browser, needs no internet, and has no login.

## What it does

- **Orders screen**: shows what you still need to make, grouped as *Overdue*, *Today*, *Tomorrow*, *Next 7 days* and *Later*. The top bar shows how many orders are due today. You can search by name, cake or phone number.
- **New order** (the round ＋ button): name, WhatsApp number, date and time, what they ordered, flavour, size, the writing on the cake, pickup or delivery (with address), price, how much they've paid, and notes such as allergies or theme.
- **Order page**: tap one of the four steps to move the order along: **To do → Baking → Ready → Delivered**. There's a button to mark the order fully paid, and buttons to edit, cancel or delete it. **Copy as new order** saves typing when someone orders the same cake again.
- **WhatsApp buttons**: *Send order confirmation* and *Tell them it's ready* open WhatsApp with a message already written (cake details, date, money still owed). You check it and press send yourself. Nothing is sent without you.
- **Money screen**: for each week it shows the number of orders, total sales, money received and money still to collect. Below that is a list of everyone who still owes you money.
- **More screen**: set your bakery name and money symbol (£, $, ₹ and so on), and save or restore a backup.

## Choices I made for you

- I left the money symbol blank because I don't know your currency. Set it once under **More**.
- Phone numbers work best with the country code (for example +44 7700 900123). Without it, WhatsApp may not find the person.
- Orders are saved **only on your phone, inside the browser you use**. If you clear your browser data or change phones, they're gone. Tap **More → Save backup file** about once a week and send the file to yourself on WhatsApp or email. If you haven't saved a backup for over a week, the app shows a reminder.

## How to open it

The app is three files: `index.html`, `style.css` and `app.js`. Keep them together in one folder.

- **On a computer:** double-click `index.html`.
- **On your phone:** the easiest way is to put the folder on any free website host (for example Netlify Drop, where you drag the folder in). Then open the link in Chrome or Safari and choose **Add to Home screen**, so it opens like an app. You can also copy the three files to your phone and open `index.html`, but some phones handle saved data from local files unreliably. A website link is safer.
- If you set it up on a computer first, it won't carry over to your phone automatically. Use **Save backup file** on one and **Restore from backup file** on the other.

## What I checked

I tested it in a phone-sized browser: adding orders, the date groups, the status steps, marking orders paid, copy, cancel, delete, search, the weekly money totals, settings, and saving and restoring a backup. Everything worked with no errors.

## What could go wrong

- If the browser's data is cleared, your orders are lost unless you saved a backup.
- The WhatsApp buttons only open WhatsApp if it's installed on that device.
- There's no sharing between devices. It's meant for one person on one phone.
