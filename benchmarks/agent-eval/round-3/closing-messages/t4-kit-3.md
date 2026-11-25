# Your Cake Order Book is ready

I made you a simple order book for your home bakery. It is one file, `index.html`, and it's built for your phone.

## What I planned (and what I assumed)
- **Who:** you, on your phone, right after a cake order comes in on WhatsApp (5 to 20 a week).
- **Your main job, step by step:**
  1. An order comes in on WhatsApp. Tap **+ New order** and fill in the name, number, cake, size, message on the cake, date and time, pickup or delivery, price and advance. You see the order under the day it's due.
  2. Open the app any time. **Coming up** lists the orders by day. Today is highlighted, and anything overdue is in red at the top.
  3. As you work, tap **Start baking**, then **Mark ready**, then **Mark picked up** (or **Mark delivered**). Finished orders move to the **Finished** tab.
  4. When the customer pays the rest, tap **Got ₹…** and the order shows "Paid in full".
  5. Tap **Message** to open WhatsApp with a ready-made note to that customer (order confirmed, cake is ready, or thank you). You can change the text before you send it.
- **Extras:** included are WhatsApp messages, money still owed, search, and backup files. I left out reminders/notifications (they need an installed app or a server) and an ingredients or shopping list (could come later).
- **Assumed:** only you use it, there are no logins, nobody else sees your data, and there's no online payment.
- **How it works:** a single web page that saves orders **inside your phone's browser**. There is no account, no internet service and nothing to install. I chose this because it's the simplest thing that does the job. If you ever want your orders on two phones, or a helper needs to see them, it would need an online version instead.
- **Look:** a cream "order notebook" with a raspberry-icing colour for the main buttons. The message to pipe on the cake sits in a dashed "icing" box so you can't miss it. I used your phone's built-in fonts so the app works without internet.

## Please know this
- **Your orders live only in that browser on that phone.** Clearing your browser data, or switching to a new phone, will wipe them. Open **Backup and settings** → **Save backup file** about once a week, and keep the file somewhere safe (for example, email it to yourself). **Load backup file** puts the orders back.
- In **Backup and settings**, type your **money sign** (for example ₹) and your **country code** (for example 91). The country code is what lets the WhatsApp button find numbers you saved without it.
- **Deleting** an order can't be undone. If a customer cancels, set the status to *Cancelled* instead.

## How to open it
- **On a computer, to try it out:** double-click `index.html`.
- **On your phone:** the easiest way is to put it on a free web host and save the link to your home screen. I did **not** put it online for you, because that publishes something and you should decide that. Netlify Drop is one option: you drag the folder in and get a link. Ask me and I'll walk you through it. Copying the file onto the phone and opening it there sometimes works, but some phone browsers don't keep the saved orders reliably for files opened that way.

## What I checked
- **Running the app:** a test script used it in a real (headless) Chrome browser at phone width, with long real-style orders (a 2-tier cake for a 60th birthday, a long message, allergy notes and a delivery address). All 25 steps passed:
  - empty and blank forms are refused with clear messages, and a "paid more than the price" mistake is caught
  - saving, grouping by day and showing overdue orders
  - the WhatsApp link adds the country code and includes the cake message and the balance
  - moving an order through Baking → Ready → Delivered, and marking it paid
  - search, editing, and the phone's Back button
  - orders are still there after a reload
  - nothing makes the page scroll sideways
  - saving a backup file, refusing a wrong file and restoring a good backup
  - deleting an order
  - text that looks like code in a name is shown as plain text
- **Looking at it:** I looked at screenshots of the order list and the form. That's how I spotted blue link-coloured buttons, and I fixed them.
- **Design check:** the kit's design check found no "template" warning signs.
- **Not checked:** a real phone, Safari on iPhone, and WhatsApp actually opening (I only checked that the link is correct).

**Try it in a minute:** open `index.html`, add one test order for today with a price and a smaller advance, tap **Start baking** → **Mark ready**, then tap **Message**. WhatsApp should open with a "your cake is ready" note that shows the balance.

## Files
- `index.html`: the whole app.
- `.uca-workspace/check.cjs`: the test script I used. It's for checking only, and you can ignore it.
- `.gitignore`: tells Git to skip that test folder. You can ignore it too.
