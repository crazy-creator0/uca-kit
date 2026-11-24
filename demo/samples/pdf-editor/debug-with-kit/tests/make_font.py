# Builds a tiny test font "BlockTest" where every letter A-Z/a-z/space is drawn as a solid block,
# so it is obvious in a rendered picture whether the custom font was used.
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
import string
chars = string.ascii_letters + ' '
names = ['.notdef'] + ['g%d' % ord(c) for c in chars]
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(names)
fb.setupCharacterMap({ord(c): 'g%d' % ord(c) for c in chars})
def block(empty=False):
    pen = TTGlyphPen(None)
    if not empty:
        pen.moveTo((50, 0)); pen.lineTo((50, 700)); pen.lineTo((550, 700)); pen.lineTo((550, 0)); pen.closePath()
    return pen.glyph()
glyphs = {n: block(n in ('.notdef', 'g32')) for n in names}
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics({n: (600, 50) for n in names})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'BlockTest', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=800, usWinAscent=800, usWinDescent=200)
fb.setupPost()
fb.save('pdfs/BlockTest.ttf')
print('ok')
