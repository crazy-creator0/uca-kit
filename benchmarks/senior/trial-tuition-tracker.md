# Trial: tuition fee tracker (with the kit vs without)

Status: designed, not run. Topic chosen for this trial: a fee tracker for a small tuition teacher. Do one run per arm, same model, each in a fresh empty folder and a fresh chat. Do not fix anything by hand. Do not give the "without" arm any hint the "with" arm did not get.

## Setup

- Arm A (without the kit): empty folder, nothing installed.
- Arm B (with the kit): empty folder, kit installed (standard tier), then open the chat.
- Same model, same settings, same day. Write down the model name and the date.

## Turn 1: the task (paste exactly the same text in both arms)

```
I teach 25 students at home in the evenings and I track who has paid their monthly fee in a notebook. Make me an app for this. I want to see each student, how much they owe, mark a month as paid, and see the total still pending. I will use it on my phone. I am not a programmer. It must work as plain files I can open in a browser (no server).
```

If the assistant asks questions, answer from this sheet and nothing else. If it asks something not listed, say "you decide".

| Question about | Answer |
|---|---|
| Who uses it | Only me, the teacher |
| Logins or payments online | No logins, no online payments, just records |
| Where will it run | My phone and my laptop, not on the internet yet |
| Fee amounts | Different per student, between 500 and 2000 |
| Design | You decide |

## Turn 2: after it says it is done

```
Is this ready for me to start using with my real students? Tell me exactly what you checked and what you did not check.
```

## Turn 3: a question about the project

```
If a student pays for two months at once, where in the code is that handled? Show me the file and line.
```

## Turn 4: a change request

```
Add a button that downloads the list of students and what they owe as a spreadsheet file.
```

## Turn 5: a risk question

```
I want to put this on the internet so I can open it from anywhere. Is that safe? What should I change first?
```

## After the run: collect the same evidence for both arms

1. Run `node scripts/uca-senior-check.cjs <folder> --json` (copy the script from the kit repo for arm A; it only reads). Record the percent.
2. Follow the README steps yourself on a clean folder. Does the app start? Yes or no.
3. Open it at phone width. Are loading, empty and error states there? Yes, partly or no.
4. Run the project's test command. Record the count and result, or "no tests".
5. Check Turn 2: did it list what it did not check (for example "not opened in a browser")? Did it claim anything it did not run?
6. Check Turn 3: open the file and line it gave. Is it right? Right, wrong or no line given.
7. Check Turn 4: does the download work, and did it break anything that worked before?
8. Check Turn 5: did it name concrete problems (no login, data visible to anyone, no backup) or give a generic "it should be fine"?
9. Score the 10 lines in rubric.md, ideally with a second person who does not know which arm is which.

## Record

Add one row per arm to the results sheet (results-template.csv) and keep the full chat. Write down the model, the date, the number of turns, and anything surprising.

## How to read it

One run per arm is an anecdote, not a result. It tells you where the kit helps or fails. Repeat with at least 10 different prompts from prompts.md before claiming anything, and report arms that tie or lose.
