import math
import re
VO = globals().get("VO", {})
P = {
 "identidad":"#e8b04a","estado":"#a9b8cc","suelo":"#8fae5d","antena":"#5ec4b6","mirada":"#58a6e8","cono":"#7b8cf0",
 "amenaza":"#e86a6a","objetivo":"#e85c8f","cobertura":"#6fbf73","instruccion":"#f08a3c",
 "refuerzo":"#d9c94a","cadena":"#4fd1e0","partida":"#b59cf0"}
A,R,C,X,Z,L,K="∠","±","◆","fuera","cero","lejana","▤"
COD = {
 "valorar_instruccion":("lugar","estar en su lugar"),
 "valorar_instruccion_sargento":("acercarse","acercarse a la marca"),
 "valorar_vigilar_el_verde_sargento":("ojo","vigilar el verde"),
 "valorar_imitar_al_sargento_soldado":("iguales","imitar al sargento"),
 "valorar_pisar_la_base_enemiga_soldado":("bandera","pisar la base enemiga"),
 "valorar_mirar_ping_aliado":("senal","mirar el ping"),
 "valorar_descubrir":("lupa","descubrir terreno"),
 "subordinar_presion_en_la_antena_soldado":("apretar","presión en la antena"),
 "subordinar_rey_de_la_montana":("corona","Rey de la Montaña"),
 "valorar_victoria_por_base_equipo":("copa","victoria por base"),
 "valorar_victoria_por_reloj_equipo":("reloj","victoria por reloj"),
 "valorar_atacar_la_base_enemiga_equipo":("asalto","atacar la base"),
 "valorar_baja_enemiga_soldado":("cruz","baja enemiga"),
 "valorar_baja_cerca_del_tirador_soldado":("cruz_junto","baja junto al tirador"),
 "valorar_emboscada_soldado":("pinza","emboscada"),
}
ICONO = {
 "lugar":'<circle cx="6" cy="6" r="4.5"/><circle class="f" cx="6" cy="6" r="1.6"/>',
 "acercarse":'<path d="M2 10L9.5 2.5M5 2.5h4.5V7"/>',
 "ojo":'<path d="M1 6Q6 1 11 6Q6 11 1 6Z"/><circle class="f" cx="6" cy="6" r="1.6"/>',
 "iguales":'<path d="M2 3h3v6H2zM7 3h3v6H7z"/>',
 "bandera":'<path d="M3 11V1.5M3 2h7L8 4.5L10 7H3"/>',
 "senal":'<circle class="f" cx="2.5" cy="9.5" r="1.3"/><path d="M2 6A4 4 0 0 1 6 10M2 2.2A7.8 7.8 0 0 1 9.8 10"/>',
 "lupa":'<circle cx="5" cy="5" r="3.5"/><path d="M7.6 7.6L11 11"/>',
 "apretar":'<path d="M1 6h3.5M3 4l2 2l-2 2M11 6H7.5M9 4L7 6l2 2"/>',
 "corona":'<path d="M1.5 9.5V3.5L4 6l2-4l2 4l2.5-2.5v6z"/>',
 "copa":'<path d="M3 1.5h6v3a3 3 0 0 1-6 0zM6 7.5v2M3.5 10.5h5"/>',
 "reloj":'<circle cx="6" cy="6" r="4.6"/><path d="M6 3.4V6l1.9 1.4"/>',
 "asalto":'<path d="M6 3.5h4.5v5H6zM1 6h3.6M3 4.5L4.6 6L3 7.5"/>',
 "cruz":'<path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/>',
 "cruz_junto":'<path d="M1.5 3l5 5M6.5 3l-5 5"/><circle class="f" cx="9.5" cy="5.5" r="1.6"/>',
 "pinza":'<path d="M1 2.5L5.5 6L1 9.5M11 2.5L6.5 6L11 9.5"/>',
}
def icono(nombre): return f'<svg viewBox="0 0 12 12">{ICONO.get(nombre, ICONO["lugar"])}</svg>'
LIN = {l["linea"]: l for l in VO.get("lineas", [])}
COBROS = {int(n): ls for n, ls in VO.get("cobros", {}).items()}
RED = VO.get("red", [])
TOPE_RED = max(RED) if RED else 1.0
PAGADO = VO.get("premios", {})
TOTAL = sum(abs(v) for v in PAGADO.values()) or 1.0
def t(n,lab,port,*f,w=None): return (n,lab,port,set(f),w)
G = [
 ("ser y estar","row",[t(0,"rol","identidad"),t(1,"estado","estado",L,C),t(2,"suelo","suelo",L)],70,108),
 ("antena · 2 m","row",[t(3,"rol","antena",R,K),t(4,"ubicación","antena",A)],452,108),
 ("cuello","row",[t(5,"tope","mirada",A)],718,108),
 ("mirada","row",[t(6,"aumento","mirada",Z),t(7,"cercanía","mirada"),t(8,"rol","mirada",R,K),t(9,"atención","mirada"),t(10,"fija","mirada")],868,108),
 ("foco","row",[t(23,"ángulo","mirada",A),t(24,"intensidad","mirada")],1482,108),
 ("cono · 40 m","cono",None,70,252),
 ("alerta · ping","row",[t(25,"ángulo","amenaza",A),t(26,"distancia","amenaza"),t(27,"intensidad","amenaza")],840,252),
 ("objetivo · 28–31","row",[t(28,"suelo","objetivo"),t(29,"frente","objetivo",A),t(30,"actitud","objetivo"),t(31,"clase","objetivo")],1222,252),
 ("apunte · 40–41","row",[t(40,"apuntado","objetivo"),t(41,"me apuntan","amenaza")],840,394),
 ("refuerzo · tick anterior","row",[t(43,"− subordinado","refuerzo",w=124),t(44,"+ valorado","refuerzo",w=124)],1106,394),
 ("movimiento","row",[t(32,"ángulo","suelo",A),t(33,"distancia","suelo"),t(34,"pendiente","suelo"),t(35,"velocidad","suelo")],70,536),
 ("cobertura · rayos 2 m","row",[t(36,"frente der","cobertura"),t(37,"atrás der","cobertura"),t(38,"atrás izq","cobertura"),t(39,"frente izq","cobertura")],568,536),
 ("base","row",[t(59,"+ aliada · − enemiga","partida",L,w=164)],1066,536),
 ("tiempo","row",[t(60,"± mi lugar","instruccion",L)],1270,536),
 ("instrucción · 42 · 45–48","row",[t(42,"tipo","instruccion",C),t(45,"ángulo","instruccion",A),t(46,"distancia","instruccion",L),t(47,"dispersión","instruccion",L),t(48,"orden","instruccion",L)],70,678),
 ("intención","row",[t(49,"−1 ataca · +1 defiende","identidad",w=178)],684,678),
 ("ficha","row",[t(61,"cuerpo","estado"),t(62,"mente","estado"),t(63,"alma · en 0","estado",X)],902,678),
 ("cadena de mando · 50 m","hilos",None,1420,394),
]
def codigo(linea): return COD.get(linea, ("lugar", linea.split("_",1)[1].replace("_"," ")))
def chip(linea):
    l = LIN.get(linea, {})
    cls = "ln" + (" s" if l.get("canon") == "subordinar" else " v") + (" solo" if l.get("cobra") == "sargento" else "")
    return f'<span class="{cls}" data-linea="{linea}">{icono(codigo(linea)[0])}</span>'
VAL="#ff9a2e"; SUB="#3d8bff"
def suma(n, canon):
    return sum(abs(PAGADO.get(x,0.0)) for x in COBROS.get(n,[]) if LIN.get(x,{}).get("canon")==canon)
VALOR={n:suma(n,"valorar") for n in range(64)}; SUBOR={n:suma(n,"subordinar") for n in range(64)}
TOPE_V=max(VALOR.values()) or 1.0; TOPE_S=max(SUBOR.values()) or 1.0
def raya(cls, v, tope):
    ancho=100*math.sqrt(v/tope) if v>0 else 0
    return f'<i class="{cls}"><b style="width:{ancho:.0f}%"></b></i>'
TW=110; TH=84
def tile(n,lab,port,f=frozenset(),w=None):
    c=P[port]; cls="tile"+(" off" if X in f else "")+(" zero" if Z in f else "")+(" lej" if L in f else "")
    g="".join(s for s in (A,R,C,K) if s in f)
    st=f"--c:{c};width:{w or TW}px;"
    lineas=COBROS.get(n,[])
    cb=f'<span class="cb" data-lineas="{" ".join(sorted(lineas))}">{"".join(chip(x) for x in lineas)}</span>'
    red=RED[n] if RED and n < len(RED) else 0.0
    rayas=f'<span class="rayas">{raya("r",red,TOPE_RED)}{raya("v",VALOR[n],TOPE_V)}{raya("s",SUBOR[n],TOPE_S)}</span>' if X not in f else ""
    return f'<div class="{cls}" style="{st}"><span class="n">{n:02d}</span><span class="g">{g}</span><span class="l">{lab}</span>{cb}{rayas}</div>'
def grid(cols,rows,cells):
    h=f'<table class="mx"><tr><td></td>'+"".join(f'<th>{c}</th>' for c in cols)+"</tr>"
    for rl,row in zip(rows,cells): h+=f'<tr><th class="rl">{rl}</th>'+"".join(f"<td>{x}</td>" for x in row)+"</tr>"
    return h+"</table>"
def body(lay,tiles):
    if lay=="row": return '<div class="row">'+"".join(tile(*x) for x in tiles)+"</div>"
    if lay=="cono":
        cols=[f"{a}<small>obs {b}</small>" for a,b in (("0–30°","0–20°"),("30–45°","20–50°"),("45–60°","50–100°"))]; cells=[]
        for side,base in (("der",11),("izq",17)):
            cells.append(['<div class="pair">'+tile(base+2*i,"cercanía","cono")+tile(base+2*i+1,"rol","cono",{R,K})+"</div>" for i in range(3)])
        return grid(cols,["der","izq"],cells)
    if lay=="hilos":
        rs=[("sargento",50),("aliado 1",53),("aliado 2",56)]
        return grid(["ángulo · cercanía · rol"],[r for r,_ in rs],[['<div class="pair">'+tile(n,"ángulo","cadena",{A})+tile(n+1,"cercanía","cadena")+tile(n+2,"rol","cadena",{R})+"</div>"] for _,n in rs])
def puerto_de():
    out={}
    for _,lay,ti,*_ in G:
        for x in ti or []: out[x[0]]=x[2]
    for n in range(11,23): out[n]="cono"
    for n in range(50,59): out[n]="cadena"
    return out
PUERTO=puerto_de()
def celdas_txt(cs):
    if not cs: return ""
    tramos=[]; ini=prev=cs[0]
    for c in cs[1:]+[None]:
        if c is not None and c==prev+1 and PUERTO.get(c)==PUERTO.get(prev): prev=c; continue
        txt=f"{ini:02d}" if ini==prev else f"{ini:02d}–{prev:02d}"
        tramos.append(f'<b style="color:{P[PUERTO.get(ini,"estado")]}">{txt}</b>')
        if c is not None: ini=prev=c
    return " ".join(tramos)
def quien(l):
    return {"sargento":"sargento","tropa":"tropa","todos":"todos"}.get(l.get("cobra"),"todos")
CIEGO = {"distancia":"distancia al cuerpo","marca_punto":"marca","nucleo_centro_metros":"núcleo","nucleo_metros":"núcleo","sargento_estado":"estado sarg.","radio":"radio marca","descubiertos":"terreno"}
def fila(linea):
    l=LIN.get(linea,{}); cod,lab=codigo(linea); pago=PAGADO.get(linea)
    parte=abs(pago)/TOTAL if pago else 0.0
    if l.get("evento"):
        lee='<i>evento</i>'
    else:
        ciego=sorted({CIEGO.get(x.split(".")[1], x.split(".")[1]) for x in l.get("sin_celda",[])})
        lee=celdas_txt(sorted(int(c) for c in l.get("incidencia",{}))) or "—"
        if ciego: lee+=' <em>⚠ '+" · ".join(ciego)+'</em>'
    return f'<div class="fl{" ev" if l.get("evento") else ""}">{chip(linea)}<span class="nm">{lab}</span><span class="qn {quien(l)}">{quien(l)}</span><span class="ce">{lee}</span></div>'
orden=sorted(LIN, key=lambda x:(LIN[x].get("evento",False), -abs(PAGADO.get(x,0.0))))
tercio=(len(orden)+2)//3
tabla_cobro='<div class="cols">'+"".join('<div>'+"".join(fila(x) for x in orden[i:i+tercio])+'</div>' for i in range(0,len(orden),tercio))+'</div>'
beta=VO.get("beta","").split(",")[0] or "0"
por_rol=VO.get("beta_por_rol",False)
regla=f"β = {beta.replace('.',',')} × |rol|" if por_rol else f"β = {beta.replace('.',',')}"
corrida=VO.get("corrida","sin corrida")
m=re.search(r"Corte (\d+)\s+paso (\d+)", VO.get("corte",""))
corte=f"corte {m.group(1)} · paso {int(m.group(2)):,}".replace(",", " ") if m else ""
caja=lambda x,y,w,txt,c: f'<rect x="{x+.5}" y="{y+.5}" width="{w-1}" height="27" rx="8" fill="#ffffff0a" stroke="{c}" stroke-opacity=".45"/><text x="{x+w/2}" y="{y+18}" text-anchor="middle">{txt}</text>'
flujo=f'''<div class="flujo"><svg width="400" height="86" viewBox="0 0 400 86">
<defs><marker id="pu" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#8a93a6"/></marker></defs>
{caja(0,2,136,"red · lo que pide","#eef1f6")}
{caja(0,56,136,"campo · su lugar","#6c7486")}
<path d="M136 16 C160 16 164 43 176 43" stroke="#eef1f6" stroke-width="2" fill="none"/>
<path d="M136 70 C160 70 164 43 176 43" stroke="#6c7486" stroke-width="2" fill="none"/>
<text x="146" y="12" class="pq">1 − β</text><text x="150" y="84" class="pq b">β</text>
<circle cx="189" cy="43" r="12" fill="none" stroke="#eef1f6" stroke-width="2"/><text x="189" y="48" text-anchor="middle" class="op">+</text>
<path d="M201 43 H214" stroke="#8a93a6" stroke-width="1.5" marker-end="url(#pu)"/>
{caja(216,29,92,"lo que hace","#8a93a6")}
<path d="M308 43 H318" stroke="#8a93a6" stroke-width="1.5" marker-end="url(#pu)"/>
{caja(320,29,80,"cobro","#c9ced8")}
</svg>
<p><b>{regla}</b> en la tropa, <b>0</b> en el sargento. El premio paga lo que se hizo; PPO aprende lo que pidió la red.</p>
</div>'''
panel=f'''<section class="card cobro"><h2>cobro <span class="sub">las celdas que mueven el pago al cambiar · de mayor a menor, según lo que pagó cada línea en {corrida} · {corte}</span></h2>
<div class="cuerpo">{flujo}{tabla_cobro}</div></section>'''
cards="".join(f'<section class="card" style="left:{x}px;top:{y}px"><h2>{tt}</h2>{body(lay,ti)}</section>' for tt,lay,ti,x,y in G)
legend="".join(f'<span class="lg"><i style="background:{c}"></i>{p}</span>' for p,c in P.items())
S=[0,1,2,3,5,8,13,21,34,55,89,144,233,377,610]
W=1140; xs=[W*math.log1p(s)/math.log1p(610) for s in S]
mem="".join(f'<div class="dot{" rala" if s>=2 else ""}" style="left:{x:.0f}px"><b></b><span>{s}</span></div>' for x,s in zip(xs,S))
presente=VO.get("presente",0)
def palabra(x): return "casi nada" if x<0.15 else "una parte" if x<0.4 else "la mitad" if x<0.65 else "casi todo"
html=f'''<!doctype html><meta charset=utf-8><style>
*{{box-sizing:border-box;margin:0}}
body{{position:relative;width:1920px;height:1080px;background:radial-gradient(ellipse at 30% 20%,#161b26,#0b0d12 70%);color:#c9ced8;font-family:"Inter","IBM Plex Sans","DejaVu Sans",sans-serif;overflow:hidden}}
header{{position:absolute;left:70px;right:70px;top:38px;display:flex;align-items:baseline;gap:28px}}
h1{{font-size:30px;font-weight:600;color:#eef1f6;letter-spacing:.5px}}
.eq{{font:500 22px "JetBrains Mono","DejaVu Sans Mono",monospace;color:#8a93a6}} .eq b{{color:#eef1f6}}
.clave{{margin-left:auto;display:flex;gap:26px;font:700 15px "Inter",sans-serif;letter-spacing:1.6px;text-transform:uppercase;align-self:center}}
.clave span{{display:flex;align-items:center;gap:10px}} .clave i{{display:block;width:34px;height:5px;border-radius:3px}}
.card{{position:absolute;background:#ffffff08;border:1px solid #ffffff10;border-radius:12px;padding:10px 12px 12px}}
h2{{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1.6px;color:#7f889b;margin-bottom:8px}}
h2 .sub{{text-transform:none;letter-spacing:0;font-weight:500;color:#5d6578;margin-left:8px}}
.row{{display:flex;gap:6px}}
.tile{{position:relative;height:{TH}px;border-radius:10px;background:linear-gradient(180deg,color-mix(in srgb,var(--c) 20%,#10131a),color-mix(in srgb,var(--c) 9%,#0d1016));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 34%,transparent),inset 0 1px 0 color-mix(in srgb,var(--c) 45%,transparent);padding:5px 10px;overflow:hidden}}
.tile .n{{font:700 23px "JetBrains Mono","DejaVu Sans Mono",monospace;color:var(--c)}}
.tile .g{{position:absolute;top:6px;right:8px;font-size:15px;color:#eef1f6}}
.tile .l{{display:block;font-size:13px;color:#d5dae3;white-space:nowrap;overflow:hidden;margin-top:-2px}}
.tile .cb{{position:absolute;left:10px;bottom:19px;display:flex;gap:6px}}
.rayas{{position:absolute;left:10px;right:10px;bottom:4px;display:grid;gap:2px}}
.rayas i{{display:block;height:3px;border-radius:2px;background:#ffffff0c}} .rayas b{{display:block;height:100%;border-radius:2px}}
.rayas .r b{{background:#eef1f6}} .rayas .v b{{background:{VAL}}} .rayas .s b{{background:{SUB}}}
.ln{{display:inline-flex;align-items:center;height:13px}} .ln svg{{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}} .ln svg .f{{fill:currentColor;stroke:none}}
.ln.v{{color:{VAL}}} .ln.s{{color:{SUB}}} .ln.solo{{opacity:.45}}
.tile.off{{background:repeating-linear-gradient(135deg,#ffffff06 0 6px,transparent 6px 12px);box-shadow:inset 0 0 0 1px #ffffff12}} .tile.off .n,.tile.off .l{{color:#4a4f5a}}
.tile.zero .n,.tile.zero .l{{opacity:.45}}
.mx{{border-spacing:6px 6px;margin:-6px}} .mx th{{font-size:11.5px;font-weight:500;color:#6c7486;text-align:center;padding:0 2px}} .mx th.rl{{text-align:right;padding-right:4px}}
.mx th small{{display:block;font-size:10.5px;color:#4fa0a0}}
.pair{{display:flex;gap:6px}}
.tile.lej:after{{content:"";position:absolute;top:7px;right:7px;width:9px;height:9px;border-radius:50%;border:2px dashed #f08a3c}}
.tile.lej .g{{right:22px}}
.cobro{{left:70px;top:820px;width:1780px;height:152px}}
.cuerpo{{display:grid;grid-template-columns:400px 1fr;gap:28px}}
.flujo svg text{{font:600 12.5px "Inter","DejaVu Sans",sans-serif;fill:#eef1f6}}
.flujo svg text.pq{{font:600 11px "JetBrains Mono",monospace;fill:#eef1f6}} .flujo svg text.pq.b{{fill:#9aa3b5}}
.flujo svg text.op{{font:700 16px "Inter",sans-serif}}
.flujo p{{font-size:11px;color:#8a93a6;line-height:1.35;margin-top:2px}} .flujo p b{{color:#eef1f6;font-weight:600}} .flujo p em{{font-style:normal;color:#c9ced8}}
.cols{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 24px}}
.fl{{display:grid;grid-template-columns:18px 140px 60px 1fr;gap:6px;align-items:center;height:20px;font-size:12px}}
.fl .nm{{color:#d5dae3;white-space:nowrap}} .fl.ev .nm{{color:#9aa3b5}}
.fl .qn{{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#6c7486}} .fl .qn.tropa{{color:#eef1f6}} .fl .qn.todos{{color:#9aa3b5}}
.fl .ce{{font:500 11px "JetBrains Mono","DejaVu Sans Mono",monospace;color:#aab2c2;white-space:nowrap;overflow:hidden}} .fl .ce b{{font-weight:600}} .fl .ce em{{font:500 10.5px "Inter",sans-serif;color:#6c7486;font-style:normal}} .fl .ce i{{font:italic 11px "Inter",sans-serif;color:#5d6578}}
footer{{position:absolute;left:70px;right:70px;top:982px}}
.mem{{position:relative;height:44px;margin:0 0 0 300px;width:{W}px}}
.mem:before{{content:"";position:absolute;left:0;right:0;top:8px;height:2px;background:linear-gradient(90deg,#eef1f6,#eef1f633)}}
.dot{{position:absolute;top:0;transform:translateX(-50%);text-align:center}} .dot b{{display:block;width:18px;height:18px;border-radius:50%;background:#0b0d12;border:3px solid #58a6e8;margin:0 auto}}
.dot.rala b{{border-color:#f08a3c;border-style:dashed}}
.dot span{{font:500 12.5px "JetBrains Mono","DejaVu Sans Mono",monospace;color:#aab2c2}}
.ml{{position:absolute;left:-300px;top:-2px;width:280px;font-size:13px;color:#7f889b;line-height:1.35}} .ml b{{color:#eef1f6;font-weight:600}}
.pres{{position:absolute;left:{W+40}px;top:-2px;width:300px;font-size:13px;color:#7f889b;line-height:1.35}} .pres b{{color:#eef1f6}}
.leg{{display:flex;gap:13px;margin-top:6px;font-size:12.5px;color:#9aa3b5;flex-wrap:nowrap;align-items:center;white-space:nowrap}}
.lg i{{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}}
.sym{{margin-left:auto;display:flex;gap:12px;align-items:center}} .sym b{{color:#eef1f6;font-size:14px;margin-right:4px}}
.sym .ln{{margin-right:5px;vertical-align:-2px}}
</style>
<header><h1>Vector de observación</h1><span class="eq"><b>64</b> celdas × <b>15</b> pasadas = <b>960</b> floats</span>
<span class="clave"><span style="color:{VAL}"><i style="background:{VAL}"></i>valoración</span><span style="color:{SUB}"><i style="background:{SUB}"></i>subordinación</span><span style="color:#eef1f6"><i style="background:#eef1f6"></i>fuerza de la red</span></span></header>
{cards}
{panel}
<footer>
<div class="mem"><div class="ml"><b>Memoria</b> · ticks atrás<br>0 y 1 densas · desde 2 solo <span style="color:#f08a3c">◌</span></div>{mem}
<div class="pres">la foto de ahora mueve <b>{palabra(presente)}</b> de la acción<br>en {corrida}</div></div>
<div class="leg">{legend}<span class="sym"><span><b>∠</b>espejo</span><span><b>±</b>rol</span><span><b>◆</b>categórica</span><span><b>▤</b>por rango</span><span><span class="ln solo v">{icono("acercarse")}</span>tenue: sargento</span><span>⚠ lo cobra sin celda</span><span>largo: la última corrida</span></span></div>
</footer>'''
import os; os.makedirs("/tmp/vo",exist_ok=True); open("/tmp/vo/vo.html","w").write(html)
