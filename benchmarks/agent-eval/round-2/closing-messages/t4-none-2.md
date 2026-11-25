Your bakery order app is ready. It's one file: `index.html`.

**What it does**
- **+ New order**: type the customer's name, WhatsApp number, what they want (for example "1 kg chocolate cake"), the writing on the cake, the date and time, the price and any advance they paid.
- **List of orders**: the soonest order is at the top. "Today" and "Tomorrow" show in red so you don't miss them. Each order also shows how much the customer still owes.
- **One tap to move an order along**: New → Baking → Ready → Delivered.
- **WhatsApp button**: opens a chat with that customer with a short message already filled in, for example to say "it's ready!".
- **Tabs**: To do, This week, and Delivered (your history). At the top you'll see how much money you still have to collect.
- **Edit or delete** any order. It asks you before deleting.

**Choices I made for you**
- It is built for a phone screen, with big buttons.
- Orders are saved **only on the phone you use it on**. They are not sent to the internet, and there is no login.
- Prices are plain numbers with no currency sign.
- Enter WhatsApp numbers with the country code (for example 91… for India). Otherwise the WhatsApp button won't work.

**Important: keep a backup**
If you clear your browser data or change phones, your orders will be gone. Every week or so, tap **Save backup file** at the bottom of the list. **Restore from backup** brings your orders back.

**Getting it onto your phone**
The app has to be opened from a web address so your phone can use it. One easy way: ask a friend to put the file on a free hosting service such as Netlify Drop or GitHub Pages. Then open that address on your phone and use "Add to Home screen" so it works like an app. (On a computer, you can just double-click `index.html`.)

**Testing**
I tested it in a phone-sized browser: I added an order, moved it to "Baking", reloaded the page, and the order was still there. There were no errors.
