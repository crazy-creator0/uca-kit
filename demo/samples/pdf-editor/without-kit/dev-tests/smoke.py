import sys, asyncio, os
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8790/'
F=os.path.join(os.path.dirname(os.path.abspath(__file__)),'files')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--no-proxy-server','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run'])
        ctx = await b.new_context(accept_downloads=True, viewport={'width':1280,'height':900})
        page = await ctx.new_page()
        reqs=[]; logs=[]
        page.on('request', lambda r: reqs.append(r.url))
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await page.goto(BASE)
        await page.set_input_files('#fileInput', os.path.join(F,'sample.pdf'))
        await page.wait_for_selector('.tline', timeout=15000)
        await page.wait_for_timeout(500)
        n = await page.locator('.tline').count()
        print('tlines', n)
        await page.screenshot(path='/tmp/s1.png')
        print('\n'.join(logs)); print('REQS', sorted(set(reqs)))
        await b.close()
asyncio.run(main())
