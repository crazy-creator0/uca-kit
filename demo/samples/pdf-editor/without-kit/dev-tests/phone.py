import asyncio, os
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); F=os.path.join(HERE,'files')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--no-proxy-server','--disable-background-networking'])
        m = await b.new_context(viewport={'width':390,'height':780}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        mp = await m.new_page(); mp.on('pageerror', lambda e: print('PAGEERROR', e))
        await mp.goto('http://127.0.0.1:8790/')
        await mp.set_input_files('#fileInput', os.path.join(F,'sample.pdf')); await mp.wait_for_selector('.tline')
        print('save visible:', await mp.locator('#btnSave').is_visible(), await mp.locator('#btnSave').bounding_box())
        await mp.locator('.tline').nth(1).tap(); await mp.wait_for_timeout(300)
        await mp.keyboard.type(' (paid)'); await mp.locator('[data-tool=select]').tap()
        print(await mp.evaluate('window.__ppe.S.pages[0].objects.map(o=>o.text)'))
        await mp.screenshot(path=os.path.join(HERE,'out','phone2.png'))
        await mp.locator('#btnSave').tap(); 
        async with mp.expect_download() as dl: await mp.locator('#saveGo').tap()
        print('phone download ok', (await dl.value).suggested_filename)
        await b.close()
asyncio.run(main())
