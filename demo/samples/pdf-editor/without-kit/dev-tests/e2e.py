import asyncio, os, sys, json
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8790/'
HERE=os.path.dirname(os.path.abspath(__file__)); F=os.path.join(HERE,'files'); OUT=os.path.join(HERE,'out'); os.makedirs(OUT,exist_ok=True)
ARGS=['--no-sandbox','--no-proxy-server','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']
async def save(page, name, remove=False, image_fallback=False):
    await page.click('#btnSave')
    await page.fill('#saveName', name)
    if remove: await page.check('#saveRemove')
    async with page.expect_download(timeout=60000) as dl:
        if image_fallback:
            await page.click('#saveGo')
            await page.wait_for_selector('text=Save as pictures', timeout=20000)
            await page.click('#saveGo')
        else:
            await page.click('#saveGo')
    d = await dl.value
    path=os.path.join(OUT,name); await d.save_as(path)
    msg = await page.inner_text('#saveMsg'); print('SAVE', name, '|', msg.replace('\n',' ')[:200])
    await page.click('#saveCancel')
    return path
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        ctx = await b.new_context(accept_downloads=True, viewport={'width':1280,'height':900})
        page = await ctx.new_page()
        reqs=set(); logs=[]
        page.on('request', lambda r: reqs.add(r.url.split('?')[0]))
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
        page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await page.goto(BASE)
        await page.set_input_files('#fileInput', os.path.join(F,'sample.pdf'))
        await page.wait_for_selector('.tline', timeout=15000); await page.wait_for_timeout(400)
        # 1. edit "total amount" line
        await page.locator('.tline').nth(1).click()
        ta = page.locator('textarea.editor'); await ta.wait_for()
        print('orig line:', await ta.input_value())
        await ta.fill('The total amount due is 750 dollars.')
        await page.screenshot(path=os.path.join(OUT,'editing.png'))
        await page.keyboard.press('Escape')
        # 2. edit the red secret line -> replace
        await page.locator('.tline').nth(1).click()   # after first edited, index shifts
        ta = page.locator('textarea.editor'); await ta.wait_for()
        print('line2:', await ta.input_value())
        await ta.fill('SECRET: [removed]')
        await page.keyboard.press('Escape')
        props = await page.inner_text('#propsBar'); print('props:', props.replace('\n',' ')[:150])
        # 3. add multilingual text
        await page.click('[data-tool=text]')
        box = await page.locator('.page').first.bounding_box()
        await page.mouse.click(box['x']+150, box['y']+600)
        ta = page.locator('textarea.editor'); await ta.wait_for()
        await ta.fill('Hello नमस्ते مرحبا 你好 Привет')
        await page.keyboard.press('Escape')
        # 4. whiteout
        await page.click('[data-tool=whiteout]')
        await page.mouse.move(box['x']+600, box['y']+600); await page.mouse.down(); await page.mouse.move(box['x']+800, box['y']+700, steps=5); await page.mouse.up()
        # 5. draw
        await page.click('[data-tool=draw]')
        await page.mouse.move(box['x']+200, box['y']+640); await page.mouse.down(); await page.mouse.move(box['x']+300, box['y']+690, steps=8); await page.mouse.move(box['x']+400, box['y']+640, steps=8); await page.mouse.up()
        # 6. tick
        await page.click('[data-tool=mark]'); await page.mouse.click(box['x']+500, box['y']+700)
        await page.wait_for_timeout(300)
        await page.screenshot(path=os.path.join(OUT,'page1.png'))
        st = await page.evaluate('JSON.stringify(window.__ppe.S.pages[0].objects.map(o=>({k:o.kind,t:o.text,f:o.font,hs:o.hscale,c:o.color,cv:o.cover&&o.cover.color})))'); print('objs', st)
        # undo/redo check
        await page.click('#btnUndo'); n1 = await page.evaluate('window.__ppe.S.pages[0].objects.length'); await page.click('#btnRedo'); n2 = await page.evaluate('window.__ppe.S.pages[0].objects.length'); print('undo/redo', n1, n2)
        p1 = await save(page, 'edited-inplace.pdf')
        p2 = await save(page, 'edited-removed.pdf', remove=True)
        # organizer: rotate page 2, delete page 3, merge other.pdf, add blank
        await page.click('#btnPages')
        await page.locator('.thumb').nth(1).locator('[data-a=rotr]').click()
        await page.locator('.thumb').nth(2).locator('[data-a=del]').click()
        await page.set_input_files('#mergeInput', os.path.join(F,'other.pdf'))
        for _ in range(50):
            if await page.evaluate('window.__ppe.S.pages.length')==3: break
            await page.wait_for_timeout(200)
        await page.click('#orgBlank')
        await page.wait_for_timeout(500)
        await page.screenshot(path=os.path.join(OUT,'organizer.png'))
        await page.click('#orgDone')
        p3 = await save(page, 'organized.pdf')
        # find & replace
        await page.click('#btnFind'); await page.fill('#findText','hello'); await page.click('#findGo')
        await page.wait_for_timeout(500); print('find:', await page.inner_text('#findStatus'))
        print('\n'.join(logs)); print('REQS', sorted(reqs))
        # locked PDF
        page2 = await ctx.new_page(); page2.on('pageerror', lambda e: print('PAGEERROR2', e))
        page2.on('request', lambda r: reqs.add(r.url.split('?')[0]))
        await page2.goto(BASE)
        await page2.set_input_files('#fileInput', os.path.join(F,'locked.pdf'))
        await page2.wait_for_selector('.tline', timeout=15000)
        await page2.locator('.tline').first.click(); ta = page2.locator('textarea.editor'); await ta.fill('Locked file edit'); await page2.keyboard.press('Escape')
        await save(page2, 'locked-edited.pdf', image_fallback=True)
        # password PDF
        await page2.evaluate('window.__ppe.S.unsaved=false')
        await page2.set_input_files('#fileInput', os.path.join(F,'password.pdf'))
        await page2.wait_for_selector('#pw'); await page2.fill('#pw','userpw'); await page2.click('#pwOk')
        await page2.wait_for_selector('.tline', timeout=15000); print('password pdf opened')
        print('ALL REQS', sorted(reqs))
        await b.close()
asyncio.run(main())
