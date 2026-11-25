# Your bakery order app is ready

Open **index.html** in a browser on your phone, or on a computer first to try it out.

**What it does**
- **+ New order**: add the customer's name, WhatsApp number, the cake, the message for the cake, the date and time, the price and the advance paid, and whether it's pickup or delivery. There's a Notes box where you can paste the whole WhatsApp chat.
- **This week**: shows what's due in the next 7 days, grouped by day ("Today", "Tomorrow", "Friday, Nov 27"). If an order is late, its card turns pink.
- Tap the coloured button on an order to move it along: **Start baking**, then **Mark ready**, then **Mark collected**.
- Each card shows how much the customer still owes. **Mark paid** sets that to zero, and the **Owed** tab lists everyone who hasn't paid yet.
- The **WhatsApp** button opens a chat with that customer, with a short message already started for you.
- There's a search box for names, cakes or phone numbers, plus **Upcoming** and **Done** tabs.

**What I decided for you**
- No login and no internet needed. Your orders are saved only on the phone where you use the app.
- Prices show in ₹. You can change the symbol in the **⋯** menu.
- I left out recipes, stock tracking and sharing the app with a helper. We can add any of these later.

**Important:** if you clear your browser data, your orders are deleted. Once a week, open **⋯** and tap **Save backup file**, then send that file to yourself on WhatsApp. To bring the orders back, use **Restore** in the same menu.

**How I checked it**
- An automated test ran on a phone-sized screen. It added an order with a long note in English, Hindi and emoji, then checked the amount owed (₹1200 − ₹500 = ₹700), moved the order through every status, marked it paid, reloaded the page and found the order in Done. It also checked that the form refuses to save with no name. All 11 checks passed.
- I looked at screenshots of the order list and the form at phone width.
- The kit's readiness check reached Silver (25 of 26 checks). The design check found no problems.

**Not checked yet:** I haven't tried it on a real phone, the WhatsApp button, or downloading and restoring a backup file on a phone.

**One thing to do next:** to open it easily on your phone, the files need to be online. Free static hosting such as Netlify Drop works, and the README has the steps. Then open the link and tap "Add to Home screen".

Files: index.html, style.css, app.js, README.md, PROJECT.md (plan), DESIGN.md (look), test/app.test.cjs. I didn't use Git, as instructed.
