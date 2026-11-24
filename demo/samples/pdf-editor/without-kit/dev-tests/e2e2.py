import asyncio, os, time
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8790/'
HERE=os.path.dirname(os.path.abspath(__file__)); F=os.path.join(HERE,'files'); OUT=os.path.join(HERE,'out'); os.makedirs(OUT,exist_ok=True)
ARGS=['--no-sandbox','--no-proxy-server','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']
async def save(page, name, remove=False):
    await page.click('#btnSave'); await page.fill('#saveName', name)
    if remove: await page.check('#saveRemove')
    async with page.expect_download(timeout=120000) as dl: await page.click('#saveGo')
    d = await dl.value; path=os.path.join(OUT,name); await d.save_as(path)
    print('SAVE', name, '|', (await page.inner_text('#saveMsg')).replace('\n',' ')[:150]); await page.click('#saveCancel'); return path
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        ctx = await b.new_context(accept_downloads=True, viewport={'width':1280,'height':900})
        page = await ctx.new_page(); reqs=set()
        page.on('request', lambda r: reqs.add(r.url))
        page.on('pageerror', lambda e: print('PAGEERROR', e))
        page.on('console', lambda m: print('CONSOLE', m.type, m.text[:200]) if m.type=='error' else None)
        await page.goto(BASE)
        # --- rotated page edit
        await page.set_input_files('#fileInput', os.path.join(F,'sample.pdf'))
        await page.wait_for_selector('.tline'); await page.fill('#pageNum','2'); await page.press('#pageNum','Enter'); await page.wait_for_timeout(800)
        s2 = page.locator('.page-slot').nth(1)
        tl = s2.locator('.tline').first; await tl.wait_for(timeout=10000)
        await tl.click(); ta=page.locator('textarea.editor'); print('rot line:', await ta.input_value()); await ta.fill('Rotated page EDITED'); await page.keyboard.press('Escape')
        await page.click('[data-tool=text]'); bb = await s2.bounding_box(); await page.mouse.click(bb['x']+100, bb['y']+60)
        ta=page.locator('textarea.editor'); await ta.fill('New text top-left of rotated page'); await page.keyboard.press('Escape')
        await page.wait_for_timeout(300); await s2.screenshot(path=os.path.join(OUT,'rot-screen.png'))
        await save(page, 'rot.pdf')
        # user-rotate page 3 then add text
        await page.click('#btnPages'); await page.locator('.thumb').nth(2).locator('[data-a=rotr]').click(); await page.click('#orgDone')
        await page.fill('#pageNum','3'); await page.press('#pageNum','Enter'); await page.wait_for_timeout(800)
        s3 = page.locator('.page-slot').nth(2); bb = await s3.bounding_box()
        await page.click('[data-tool=text]')
        print('under click:', await page.evaluate('([x,y])=>{const e=document.elementFromPoint(x,y);return e&&e.className}', [bb['x']+120, bb['y']+60]), bb)
        await page.mouse.click(bb['x']+120, bb['y']+60)
        ta=page.locator('textarea.editor'); await ta.fill('Added on user-rotated page'); await page.keyboard.press('Escape')
        await page.wait_for_timeout(300); await s3.screenshot(path=os.path.join(OUT,'rot3-screen.png'))
        await save(page, 'rot3.pdf')
        # --- session restore
        await page.wait_for_timeout(2500)
        page2 = await ctx.new_page(); page2.on('pageerror', lambda e: print('PAGEERROR2', e))
        await page2.goto(BASE); await page2.wait_for_selector('#btnResume', state='visible', timeout=10000)
        print('resume box:', (await page2.inner_text('#resumeBox')).replace('\n',' '))
        await page2.click('#btnResume'); await page2.wait_for_timeout(2000)
        print('restored objects:', await page2.evaluate('window.__ppe.S.pages.map(p=>p.objects.length+"/"+p.rot)'))
        await page2.close()
        # --- big document
        await page.evaluate('window.__ppe.S.unsaved=false')
        t=time.time(); await page.set_input_files('#fileInput', os.path.join(F,'big.pdf'))
        for _ in range(300):
            if await page.evaluate('window.__ppe.S.pages.length')==300: break
            await page.wait_for_timeout(100)
        print('big open secs', round(time.time()-t,1))
        await page.fill('#pageNum','250'); await page.press('#pageNum','Enter'); await page.wait_for_timeout(1500)
        print('canvases alive', await page.evaluate('document.querySelectorAll("canvas.render").length'))
        await page.screenshot(path=os.path.join(OUT,'big250.png'))
        await page.click('#btnFind'); await page.fill('#findText','of the big document'); t=time.time(); await page.click('#findGo')
        await page.wait_for_function('document.querySelector("#findStatus").textContent.startsWith("Found")', timeout=120000) if False else None
        for _ in range(600):
            st = await page.inner_text('#findStatus')
            if st.startswith('Found') or st.startswith('Not'): break
            await page.wait_for_timeout(200)
        print('find:', st, round(time.time()-t,1),'s')
        await page.fill('#replaceText','of the GREAT document'); await page.click('#replaceAll'); await page.click('.modal button.primary')
        t=time.time()
        for _ in range(900):
            st = await page.inner_text('#findStatus')
            if st.startswith('Replaced on'): break
            await page.wait_for_timeout(200)
        print('replace:', st, round(time.time()-t,1),'s'); await page.click('#findClose')
        t=time.time(); await save(page, 'big-edited.pdf'); print('big save secs', round(time.time()-t,1))
        t=time.time(); await save(page, 'big-removed.pdf', remove=True); print('big flatten save secs', round(time.time()-t,1))
        # --- phone layout
        m = await b.new_context(viewport={'width':390,'height':780}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mp = await m.new_page(); await mp.goto(BASE); await mp.screenshot(path=os.path.join(OUT,'phone-home.png'))
        await mp.set_input_files('#fileInput', os.path.join(F,'sample.pdf')); await mp.wait_for_selector('.tline')
        await mp.locator('.tline').first.tap(); await mp.wait_for_timeout(400)
        await mp.screenshot(path=os.path.join(OUT,'phone-edit.png'))
        # --- offline
        await page.reload(); await page.wait_for_timeout(1500)
        await ctx.set_offline(True)
        await page.reload(); await page.wait_for_timeout(1000)
        print('offline reload title:', await page.title(), '| has open button:', await page.locator('#btnOpen2').is_visible())
        await page.set_input_files('#fileInput', os.path.join(F,'sample.pdf')); await page.wait_for_selector('.tline', timeout=15000); print('offline open OK')
        await ctx.set_offline(False)
        print('ALL HOSTS', sorted({r.split('/')[2] for r in reqs if '://' in r}), sorted({r.split(':')[0] for r in reqs}))
        await b.close()
asyncio.run(main())
