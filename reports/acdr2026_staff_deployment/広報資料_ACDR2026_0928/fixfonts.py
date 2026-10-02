import zipfile, shutil, sys, re, os
REPS=[('ＭＳ ゴシック;MS Gothic','ＭＳ ゴシック'),('ＭＳ 明朝;MS Mincho','ＭＳ 明朝'),('ＭＳ Ｐゴシック;MS PGothic','ＭＳ Ｐゴシック'),('ＭＳ Ｐ明朝;MS PMincho','ＭＳ Ｐ明朝'),
      ('w:ascii="Liberation Serif"','w:ascii="Times New Roman"'),('w:hAnsi="Liberation Serif"','w:hAnsi="Times New Roman"'),('w:eastAsia="WenQuanYi Zen Hei"','w:eastAsia="ＭＳ 明朝"'),('w:cs="FreeSans"','w:cs="Times New Roman"')]
def fix(path):
    tmp=path+'.tmp'
    zin=zipfile.ZipFile(path); zout=zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED)
    n=0
    for item in zin.infolist():
        data=zin.read(item.filename)
        if item.filename.startswith('word/') and item.filename.endswith('.xml'):
            s=data.decode('utf-8'); o=s
            for a,b in REPS: s=s.replace(a,b)
            n+=(s!=o); data=s.encode('utf-8')
        zout.writestr(item,data)
    zin.close(); zout.close(); shutil.move(tmp,path); print(path,'parts changed',n)
for f in sys.argv[1:]: fix(f)
