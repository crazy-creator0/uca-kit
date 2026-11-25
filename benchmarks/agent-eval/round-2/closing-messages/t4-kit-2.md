# Your bakery order app is ready

**How to open it:** open `index.html` in your phone's browser. On a computer you can also run `python3 -m http.server 8000` in this folder and go to http://localhost:8000. To put it on your phone you'll need to copy the folder over or host it somewhere. I haven't done that part, but I can help with it.

**What you can do with it**
- **+ New order:** add the customer's name and WhatsApp number, the cake, the writing on the cake, the due date and time, the price, any advance paid, pickup or delivery, and notes (eggless, allergies, address). Only the name, the cake and the date are required.
- **To make:** your open orders, grouped by day as Today, Tomorrow and so on. Late orders show in red. The top line says how many orders are due this week and how much money you still have to collect.
- **One button moves an order along:** New → Confirmed → Baking → Ready → Delivered. When you mark an order Delivered, the app treats it as fully paid.
- **WhatsApp button:** opens WhatsApp with a message already written to that customer, such as "it's ready" or "balance to pay". You press send yourself.
- **Backup:** "Save a backup file" and "Restore from backup".

**Things to know**
- **Your orders are saved only in this browser on this phone.** If you clear your browser data or change phones, they are lost, unless you have a backup file. Saving a backup once a week is a good habit.
- It works on one device only, so you can't see the same orders on two phones.
- Money is shown as plain numbers with no currency sign.

**Choices I made for you:** I used a cream and brown "order book" look with big buttons for your phone. There are no logins and no internet needed. Nothing is installed.

**Checks:** I tested the app in a phone-sized browser, and these steps worked: leaving a required field empty shows the message about what to fill in; adding an order works; the money left to collect is right; the WhatsApp link is right; moving an order through to Delivered works; and orders are still there after reloading the page. The automated test passes (`npm test`), and the kit's readiness check rates it Silver with 25 of 26 checks passing. I haven't tried it on a real phone or with real WhatsApp, and I didn't use Git, as you asked.

**Possible next step:** a cake price list, so you can tap a cake instead of typing it every time.
