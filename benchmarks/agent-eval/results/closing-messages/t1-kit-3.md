I've built the tool. To start it, double-click `index.html` in the `t1-kit-3` folder. It runs in your browser and never uses the internet.

## Can I trust the totals?

**Short answer:** the adding up is checked and correct for every file I tested. Two things I could not check: your wife's real statement, and whether every category is right for your shops.

### What I checked by running it

1. **Your own statement, against my hand count.** `sample-statement.csv` gives 8 transactions and ₹29,505.90 spent in October:
   - Food ₹452.00
   - Groceries ₹1,236.50
   - Travel ₹318.40
   - Bills ₹22,000.00
   - Shopping ₹2,499.00
   - Other ₹3,000.00

   Money in is ₹85,112.35 (salary plus interest). I added these up myself and the tool agrees to the paisa.
2. **The bank's running balance.** For every row, the tool checks that the previous balance minus money out plus money in equals the next balance. All 7 steps in your file agree. The file then gets a green **BALANCE CHECKED** stamp; if anything doesn't match, you get a red **CHECK THIS** with the line number.
3. **Other bank layouts.** I made up four test statements in different styles:
   - one with 600 transactions, bank header lines at the top, short dates like 31/10/26, and separate withdrawal and deposit columns;
   - one separated by tabs, newest first, with dates like "1 Oct 2026";
   - one with a single amount column plus a Dr/Cr column;
   - one where spending is shown with a minus sign and a ₹ symbol.

   A separate Python script added up each of these on its own, using none of the tool's code. Month by month, its totals match the tool's exactly, and the balance check passes on all of them.
4. **No rounding errors.** All money is counted in whole paise. 1,000 lots of ₹0.10 come to exactly ₹100.00, and an amount the tool can't read exactly is reported, not guessed.
5. **Your steps in a real Chrome browser (28 checks, all passed).** It opened the files, showed the right numbers on screen, and treated a layout it didn't recognise sensibly: it asked for the columns, and after I picked them the totals were right. It also passed these:
   - Fixing Amazon Pay to Bills moved ₹2,499 from Shopping to Bills and left the total unchanged.
   - The fix was still remembered after reloading the page.
   - Opening the same file twice didn't count it twice.
   - Unticking a statement removed exactly its spending.
   - The exported summaries showed the same totals as the screen.
   - The page didn't scroll sideways at phone width.
6. **Privacy.** During the browser run, nothing tried to go out to the internet. I also made the page try to connect out on purpose, and it was blocked.

### What I did not check

- **Your wife's actual bank file.** I haven't seen it, so its layout is a guess. When you open it, look at the stamp. If it says **COLUMNS NEEDED**, pick the date, description and amount columns once and the tool remembers them for that bank.
- **Whether a statement is complete.** If the bank's file is missing a transaction, the tool can't know. Each file shows its own money-out and money-in totals, so compare those with your bank's statement once.
- **Categories.** They come from shop names (Swiggy is Food, BigBasket is Groceries, and so on), so some will be wrong at first. That only moves money between categories; the total stays right. Cash from ATMs goes to "Other".
- **Files that aren't CSV.** Excel and PDF statements aren't read; the tool tells you to download CSV instead.
- **Phones and other browsers.** I only tested Chrome on Linux. I didn't try a real phone, Safari or Firefox. On a phone, the summary web page is the part to use.

### Choices I made for you

- "Spent" means money that went out. Salary, interest and refunds are shown separately and are not subtracted from spending.
- I added a seventh choice, **Not spending**, for money moved between your own accounts. If you send money to your wife's account, mark it Not spending; otherwise it counts once when you send it and again when she spends it.
- If a month isn't fully covered by the files you opened, it is labelled. Your sample shows "only transactions from 1 to 15 Oct".
- The summary you share with your wife has totals only, with no transaction descriptions.
- Rent counts as Bills.
- I didn't use Git, as instructed.

The project kit's own readiness check passes all 26 of its items, but that is a checklist, not proof the tool is good. To try it yourself in a minute: open your statement and you should see ₹29,505.90 in large figures, then click the ₹22,000.00 under Bills and you should see the rent.

Files are in `<project folder>/`:
- `index.html` (open this)
- `core.js` (the money calculations)
- `app.js`, `styles.css`
- `README.md` (how to use it)
- `DESIGN.md`, `PROJECT.md`, `package.json`, `.gitignore`
- `tests/` (`npm test` for the calculations, `node tests/ui-check.js` for the browser run)
