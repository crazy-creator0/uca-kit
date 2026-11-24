import asyncio, os, hashlib
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); F=os.path.join(HERE,'files'); OUT=os.path.join(HERE,'out')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--no-proxy-server','--disable-background-networking'])
        c = await b.new_context(viewport={'width':1280,'height':900}, accept_downloads=True)
        pg = await c.new_page(); pg.on('pageerror', lambda e: print('PAGEERROR', e))
        await pg.goto('http://127.0.0.1:8790/')
        await pg.set_input_files('#fileInput', os.path.join(F,'sample.pdf')); await pg.wait_for_selector('.tline')
        # image
        await pg.set_input_files('#imageInput', os.path.join(F,'photo.jpg')); await pg.wait_for_timeout(500)
        # signature (draw)
        await pg.click('[data-tool=sign]'); pad = await pg.locator('#sigpad').bounding_box()
        await pg.mouse.move(pad['x']+30, pad['y']+100); await pg.mouse.down(); await pg.mouse.move(pad['x']+200, pad['y']+40, steps=10); await pg.mouse.move(pad['x']+350, pad['y']+120, steps=10); await pg.mouse.up()
        await pg.click('#sigUse'); await pg.wait_for_timeout(500)
        # move signature by dragging
        sel = pg.locator('.obj.selected'); bb = await sel.bounding_box()
        await pg.mouse.move(bb['x']+bb['width']/2, bb['y']+bb['height']/2); await pg.mouse.down(); await pg.mouse.move(bb['x']+bb['width']/2+150, bb['y']+bb['height']/2+200, steps=6); await pg.mouse.up()
        print('objs', await pg.evaluate("window.__ppe.S.pages[0].objects.map(o=>o.kind+'@'+Math.round(o.x)+','+Math.round(o.y))"))
        await pg.screenshot(path=os.path.join(OUT,'img-sig.png'))
        await pg.click('#btnSave')
        async with pg.expect_download() as dl: await pg.click('#saveGo')
        await (await dl.value).save_as(os.path.join(OUT,'img-sig.pdf')); await pg.click('#saveCancel')
        h = await pg.evaluate("crypto.subtle.digest('SHA-256', window.__ppe.S.docs[0].bytes).then(b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''))")
        print('in-memory original unchanged:', h == hashlib.sha256(open(os.path.join(F,'sample.pdf'),'rb').read()).hexdigest())
        await b.close()
asyncio.run(main())
