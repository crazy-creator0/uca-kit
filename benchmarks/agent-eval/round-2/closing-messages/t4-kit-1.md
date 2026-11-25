# Your Bakery Order Book is ready

**What I built:** one simple page made for your phone, where you write down each WhatsApp cake order and follow it until it's picked up.

**How you use it**
1. A WhatsApp order comes in. Tap **+ New order**.
2. Type the customer's name, their WhatsApp number, what cake they want, the writing on the cake, the pickup date and time, the price and any advance they paid, plus notes (eggless, allergies, address). Tap **Save**.
3. Orders are listed by pickup day: **Overdue**, **Today**, **Tomorrow**, and later days. The line at the top tells you how many are due today, how many are due in the next 7 days, and how much money you still have to collect.
4. Tap **New → Baking → Ready → Collected** as you go. Orders marked Collected move to the "Collected" list.
5. The **WhatsApp** button opens a chat with that customer and fills in a message for you: an order confirmation, or "your cake is ready" once the order is marked Ready. You check it and press send yourself.
6. You can search by name, cake or phone number. Use **Edit** to change or delete an order (it asks before deleting).

**Choices I made for you** (since I couldn't ask): it's in English, money is shown as plain numbers with no currency sign, there's no login, and a new order's pickup date starts as tomorrow. The look is like a warm, cream-colored notebook, and the writing for each cake is highlighted in yellow so you don't miss it.

**Important: where your orders are kept.** They are saved **only on your phone, inside the browser you use**. Nobody else can see them. But if you clear your browser data or lose the phone, the orders are gone. Every week or so, open **Backup & restore** and tap **Save backup file**.

**Getting it onto your phone:** it's a small folder of files. The easiest way is to have a friend or helper put the folder on a free website host (for example Netlify Drop, where you just drag the folder in). Then open the link on your phone and choose "Add to Home screen". On a computer you can just open `index.html`.

**What I checked:** an automatic test on a phone-sized screen. It showed the empty list, the warning when a required field is left blank, adding a real order, moving it to Baking, the money totals, the WhatsApp link, and that the order is still there after reloading the page. I also looked at a screenshot of the phone screen, and the project's quality checklist passed 25 of 25 checks. **Not checked:** a real phone, and the WhatsApp app actually opening.

**Not included yet (could add later):** a price list or menu, a calendar view, photos of cake designs, and reading orders straight out of WhatsApp.

Files: `index.html` (the app), `style.css`, `app.js`, `README.md`, `DESIGN.md`, `PROJECT.md`, `tests/app.test.cjs`, `package.json`.
