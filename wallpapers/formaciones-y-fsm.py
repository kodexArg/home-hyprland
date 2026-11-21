import html as escapar
import json
import math
import os
import re
import sys
from fractions import Fraction
from pathlib import Path

REPO = Path.home() / "Dev/SyV/juego-de-syv"
VOLCADO = Path(globals().get("VOLCADO") or REPO / "docs/formaciones/formaciones.json")
FSM = globals().get("FSM")
SALIDA = Path("/tmp/vo/formaciones-y-fsm.html")

ANCHO, ALTO = 1920, 1080
MARGEN_X, MARGEN_ARRIBA = 70, 32
HUECO = 18
PAD_CARD = 14
TEXTO_CARD = 66
MIN_CARD = 150
MIN_LEYENDA = 250
BANDA_FORMACIONES = 348
RADIO = 9
RADIO_NUCLEO = 11.5
BORDE_M = 3.0
REGLA_M = 10
QUIETO_M = 2.0
FILA = ("marcha", "cuna", "caravana", "descanso", "despliegue")

FONDO_CARD = "#141822"
TINTA, TINTA_2, TINTA_3 = "#eef1f6", "#aab2c2", "#7f889b"
NUCLEO = "#eef1f6"
GRUPOS = {
    "mando": ("#22a2b4", "cabos y oficial", (2, 3, 7)),
    "especialista": ("#d06a22", "especialistas", (5, 9)),
    "soldado": ("#9078d6", "soldados", (4, 6, 8, 10, 11)),
}
ORBITA = "#d06a22"
PARA = {
    "marcha": "llegar lejos rápido",
    "cuna": "avanzar sin saber qué hay",
    "despliegue": "combatir",
    "caravana": "plantarse en un punto",
    "descanso": "recuperar",
}

GRAFO_ANCHO, GRAFO_ALTO = 930, 372
NODO = (138, 46)
NODO_EJE = (160, 74)
EJE = "DESCANSANDO"
LUGAR = {
    "DESCANSANDO": (298, 182),
    "CAMINANDO": (74, 38),
    "MARCHANDO": (74, 134),
    "CORRIENDO": (74, 230),
    "ORDENANDO": (74, 326),
    "RETROCEDIENDO": (516, 38),
    "OBSERVANDO": (516, 182),
    "PATRULLANDO": (298, 326),
    "POSICIONANDO": (516, 326),
    "PERSIGUIENDO": (682, 100),
    "ALERTADO": (856, 38),
    "APUNTANDO": (762, 182),
    "DISPARADO": (660, 262),
    "HUYENDO": (858, 326),
}
ANCLA = {("DESCANSANDO", "PERSIGUIENDO"): (0, -16), ("DESCANSANDO", "DISPARADO"): (0, 16)}
PIDE_SIEMPRE = ("ALERTADO", "APUNTANDO")
TINTE = {"mov": "#58a6e8", "combat": "#e86a6a", "hunt": "#f08a3c", "dead": "#7f889b"}
TINTE_EJE = "#eef1f6"
FAMILIA = {"mov": "se mueve o espera", "combat": "combate", "hunt": "persigue", "dead": "fuera de juego"}


def grupo(p):
    for nombre, (_, _, puestos) in GRUPOS.items():
        if p in puestos:
            return nombre
    return "soldado"


def color(p, nucleo):
    return NUCLEO if p == nucleo else GRUPOS[grupo(p)][0]


def escuadra(f, todas, n):
    base = next(x for x in todas if x["clave"] == "cuna") if f["reposa"] else f
    return base["escuadras"][str(n)]


def lugares(esc):
    pos = {esc["nucleo"]: (0.0, 0.0, 0.0, False, esc["nucleo"])}
    for p, l in esc["lugares"].items():
        pos[int(p)] = (l["x"], l["y"], l["holgura"], l["orbita"], l["ancla"])
    return pos


def caja(esc):
    pos = lugares(esc).values()
    medio_x = max(max(abs(x) + h for x, _, h, _, _ in pos), BORDE_M) + BORDE_M
    arriba = max(y + h for _, y, h, _, _ in pos) + BORDE_M
    abajo = -min(y - h for _, y, h, _, _ in pos) + BORDE_M
    return medio_x, arriba, abajo


def escala(cajas):
    util_x = ANCHO - 2 * MARGEN_X

    def cabe(k):
        anchos = [max(MIN_CARD, 2 * cajas[c][0] * k + 2 * PAD_CARD) for c in FILA]
        if sum(anchos) + HUECO * len(FILA) + MIN_LEYENDA > util_x:
            return False
        return max(cajas[c][1] + cajas[c][2] for c in FILA) * k + TEXTO_CARD + 2 * PAD_CARD <= BANDA_FORMACIONES

    lo, hi = 1.0, 30.0
    for _ in range(40):
        k = (lo + hi) / 2
        lo, hi = (k, hi) if cabe(k) else (lo, k)
    return lo


def soldado(cx, cy, p, nucleo, opacidad):
    if p == nucleo:
        return (f'<g opacity="{opacidad}"><circle cx="{cx:.1f}" cy="{cy:.1f}" r="{RADIO_NUCLEO + 5}" fill="{NUCLEO}" opacity=".14"/>'
                f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{RADIO_NUCLEO}" fill="{NUCLEO}" stroke="{FONDO_CARD}" stroke-width="1.5"/>'
                f'<text x="{cx:.1f}" y="{cy + 4:.1f}" text-anchor="middle" class="num" fill="#0b0d12">{p}</text></g>')
    c = color(p, nucleo)
    return (f'<g opacity="{opacidad}"><circle cx="{cx:.1f}" cy="{cy:.1f}" r="{RADIO}" fill="{c}" stroke="{FONDO_CARD}" stroke-width="1.5"/>'
            f'<text x="{cx:.1f}" y="{cy + 3.6:.1f}" text-anchor="middle" class="num" fill="#0b0d12">{p}</text></g>')


def campo(esc, k, ancho, alto, arriba, reposa):
    nucleo = esc["nucleo"]
    pos = lugares(esc)
    ox, oy = ancho / 2, arriba * k

    def px(x, y):
        return ox + x * k, oy - y * k

    capas = [f'<path d="M{ox - 8:.1f} 12 L{ox:.1f} 3 L{ox + 8:.1f} 12" fill="none" stroke="{TINTA_3}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>']
    opacidad = 0.4 if reposa else 1.0
    if not reposa:
        for r in sorted({round(math.hypot(x, y), 2) for x, y, _, orb, _ in pos.values() if orb}):
            capas.append(f'<circle cx="{ox:.1f}" cy="{oy:.1f}" r="{r * k:.1f}" fill="none" stroke="{ORBITA}" stroke-opacity=".16" stroke-width="{2 * QUIETO_M * k:.1f}"/>'
                         f'<circle cx="{ox:.1f}" cy="{oy:.1f}" r="{r * k:.1f}" fill="none" stroke="{ORBITA}" stroke-width="1.6" stroke-dasharray="4 4"/>')
        for p, (x, y, h, _, _) in pos.items():
            if h > 0:
                cx, cy = px(x, y)
                capas.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{h * k:.1f}" fill="{color(p, nucleo)}" fill-opacity=".13" stroke="{color(p, nucleo)}" stroke-opacity=".35" stroke-width="1.5"/>')
        for p, (x, y, _, orb, ancla) in pos.items():
            if p != nucleo and ancla != nucleo and not orb:
                a, b = px(x, y), px(*pos[ancla][:2])
                capas.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{color(p, nucleo)}" stroke-width="1.6" stroke-dasharray="4 3"/>')
    for p in sorted(pos, reverse=True):
        capas.append(soldado(*px(*pos[p][:2]), p, nucleo, opacidad))
    regla = REGLA_M * k
    capas.append(f'<g stroke="{TINTA_3}" stroke-width="1.6"><line x1="4" y1="{alto - 7}" x2="{4 + regla:.1f}" y2="{alto - 7}"/>'
                 f'<line x1="4" y1="{alto - 12}" x2="4" y2="{alto - 2}"/><line x1="{4 + regla:.1f}" y1="{alto - 12}" x2="{4 + regla:.1f}" y2="{alto - 2}"/></g>'
                 f'<text x="{9 + regla:.1f}" y="{alto - 3}" class="regla">{REGLA_M} m</text>')
    return f'<svg width="{ancho:.0f}" height="{alto:.0f}" viewBox="0 0 {ancho:.0f} {alto:.0f}">{"".join(capas)}</svg>'


def leyenda():
    filas = [f'<div class="li"><svg width="36" height="36"><circle cx="18" cy="18" r="{RADIO_NUCLEO + 5}" fill="{NUCLEO}" opacity=".14"/><circle cx="18" cy="18" r="{RADIO_NUCLEO}" fill="{NUCLEO}"/></svg><span><b>núcleo</b> · el sargento</span></div>']
    for c, texto, puestos in GRUPOS.values():
        filas.append(f'<div class="li"><svg width="36" height="36"><circle cx="18" cy="18" r="{RADIO}" fill="{c}"/></svg><span><b>{texto}</b> · {" ".join(map(str, puestos))}</span></div>')
    filas.append(f'<div class="li"><svg width="36" height="36"><line x1="3" y1="18" x2="33" y2="18" stroke="{TINTA_2}" stroke-width="1.6" stroke-dasharray="4 3"/></svg><span>cuelga de su cabo</span></div>')
    filas.append(f'<div class="li"><svg width="36" height="36"><circle cx="18" cy="18" r="13" fill="none" stroke="{ORBITA}" stroke-width="1.6" stroke-dasharray="4 4"/></svg><span>órbita del apuntador</span></div>')
    return f'<section class="card ley"><h2>Quién es quién</h2>{"".join(filas)}</section>'


def formaciones():
    datos = json.loads(VOLCADO.read_text(encoding="utf-8"))
    n = datos["por_defecto"]
    todas = {f["clave"]: f for f in datos["formaciones"]}
    escs = {c: escuadra(f, datos["formaciones"], n) for c, f in todas.items()}
    cajas = {c: caja(e) for c, e in escs.items()}
    k = escala(cajas)
    alto_m = max(cajas[c][1] + cajas[c][2] for c in FILA)
    arriba_m = max(cajas[c][1] for c in FILA)
    cards = []
    for c in FILA:
        f = todas[c]
        ancho = max(MIN_CARD - 2 * PAD_CARD, 2 * cajas[c][0] * k)
        svg = campo(escs[c], k, ancho, alto_m * k, arriba_m, f["reposa"])
        para = PARA[c] + (" · sin lugares" if f["reposa"] else "")
        cards.append(f'<section class="card"><div class="campo">{svg}</div><h3>{f["nombre"]}</h3><p>{para}</p></section>')
    cards.append(leyenda())
    cabecera = f'<header><h1>Formaciones de la escuadra</h1><span class="eq"><b>{n}</b> presentes · misma escala · frente ↑</span></header>'
    return cabecera + f'<div class="fila">{"".join(cards)}</div>'


def esquema():
    if FSM:
        return FSM
    sys.path.insert(0, str(REPO / "skills/fsm-graph"))
    import grafo
    return grafo.esquema()


def numero(x):
    return f"{x:g}".replace(".", ",")


def tinte(estado):
    return TINTE_EJE if estado["id"] == EJE else TINTE[estado["grupo"]]


def medida(estado):
    return NODO_EJE if estado == EJE else NODO


def ancla(estado, otro):
    x, y = LUGAR[estado]
    dx, dy = ANCLA.get((estado, otro), (0, 0))
    return x + dx, y + dy


def recorte(estado, otro, margen):
    w, h = medida(estado)
    cx, cy = LUGAR[estado]
    ax, ay = ancla(estado, otro)
    bx, by = ancla(otro, estado)
    dx, dy = bx - ax, by - ay
    tx = ((cx + math.copysign(w / 2 + margen, dx) - ax) / dx) if dx else math.inf
    ty = ((cy + math.copysign(h / 2 + margen, dy) - ay) / dy) if dy else math.inf
    t = min(tx, ty)
    return ax + dx * t, ay + dy * t


def marcas(estado, tiempos):
    notas = {
        "DESCANSANDO": f"pide a la red cada {numero(tiempos['descanso_s'])} s",
        "ORDENANDO": f"{numero(tiempos['grito_minimo_s'])} s y hasta {Fraction(tiempos['grito_listos']).limit_denominator(12)} en su lugar o {numero(tiempos['grito_tope_s'])} s",
        "DISPARADO": "dura un tick",
    }
    return notas.get(estado, "")


def nodo(e, tiempos, indice_orden):
    x, y = LUGAR[e["id"]]
    w, h = medida(e["id"])
    signos = ("◉" if e["id"] in PIDE_SIEMPRE else "") + ("▣" if e["guarda"] else "") + ("↻" if e["redirige"] else "")
    nivel = "" if e["nivel"] is None else f'<span class="nv">{numero(e["nivel"])}</span>'
    orden = f'<span class="or">{indice_orden[e["orden"]]} {e["orden"]}</span>' if e["orden"] else ""
    alerta = '<i class="al"></i>' if e["alerta"] else ""
    nota = marcas(e["id"], tiempos)
    nota = f'<span class="nt">{nota}</span>' if nota else ""
    clase = "nodo eje" if e["id"] == EJE else "nodo"
    return (f'<div class="{clase}" data-estado="{e["id"]}" style="--c:{tinte(e)};left:{x - w / 2:.0f}px;top:{y - h / 2:.0f}px;width:{w}px;height:{h}px">'
            f'{orden}{alerta}<span class="nm">{e["id"]}</span><span class="sg">{signos}</span><span class="ct">{e["cartel"]}</span>{nivel}{nota}</div>')


def flechas(estados, aristas):
    por_id = {e["id"]: e for e in estados}
    salen = {(a["de"], a["a"]) for a in aristas if a["motivo"] == "sale"}
    tonos = {"mov": "#7d93b4", "combat": TINTE["combat"], "hunt": TINTE["hunt"]}
    puntas = "".join(
        f'<marker id="p-{n}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 1.2 L10 5 L0 8.8 z" fill="{c}"/></marker>'
        for n, c in tonos.items()
    )
    capas = [f"<defs>{puntas}</defs>"]
    for de, a in sorted(salen):
        if de == a:
            x, y = LUGAR[de]
            arriba = y - medida(de)[1] / 2 - 3
            capas.append(f'<path data-de="{de}" data-a="{a}" d="M{x - 46} {arriba} C{x - 60} {arriba - 44}, {x - 6} {arriba - 44}, {x - 20} {arriba}" fill="none" stroke="{tonos["mov"]}" stroke-width="1.6" marker-end="url(#p-mov)"/>')
            continue
        vuelve = (a, de) in salen
        if vuelve and de > a:
            continue
        familia = por_id[de]["grupo"]
        if vuelve and familia == "mov":
            familia = por_id[a]["grupo"]
        p = recorte(de, a, 3)
        q = recorte(a, de, 3)
        inicio = f' marker-start="url(#p-{familia})"' if vuelve else ""
        par = f' data-vuelve="1"' if vuelve else ""
        capas.append(f'<line data-de="{de}" data-a="{a}"{par} x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}" stroke="{tonos[familia]}" stroke-width="1.6" stroke-opacity=".85"{inicio} marker-end="url(#p-{familia})"/>')
    return f'<svg class="hilos" width="{GRAFO_ANCHO}" height="{GRAFO_ALTO}" viewBox="0 0 {GRAFO_ANCHO} {GRAFO_ALTO}">{"".join(capas)}</svg>'


def pie_del_grafo(estados, tiempos):
    por_id = {e["id"]: e for e in estados}
    fichas = "".join(
        f'<span class="ficha" data-estado="{e}" style="--c:{TINTE["dead"]}"><b>{e}</b> {texto}</span>'
        for e, texto in (("MUERTO", "por impacto o explosión"), ("VIVO", "en pie al cerrar la partida"))
        if e in por_id
    )
    familias = "".join(f'<span><i class="cu" style="background:{TINTE[g]}"></i>{t}</span>' for g, t in FAMILIA.items())
    return (f'<div class="pie"><div class="ln"><span class="tt">todo estado vivo →</span>{fichas}'
            f'<span><i class="al fijo"></i>ver a un enemigo abre <b>ALERTADO</b></span></div>'
            f'<div class="ln">{familias}<span><b class="mono">0,6</b> nivel en la celda 01</span><span><b class="mono or fijo">1 OBSERVAR</b> orden de la red que lo abre</span></div>'
            f'<div class="ln"><span><b>▣</b> guarda la orden recibida</span><span><b>↻</b> la misma orden redirige sin transitar</span><span><b>◉</b> pide a la red en cada tick</span></div>'
            f'<div class="ln tenue">chequeo en marcha: otra orden que gana por {numero(tiempos["margen_orden"])} la corta · el rumbo que gira más de {tiempos["giro_rumbo_grados"]}° la reabre · '
            f'enfriamiento {numero(tiempos["enfriamiento_s"])} s · el sargento avisa cada {numero(tiempos["paso_sargento_m"])} m</div></div>')


def prosa(texto):
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", escapar.escape(texto))


def cuando(estados):
    por_id = {e["id"]: e for e in estados}
    grupos = {}
    for e in [por_id[i] for i in LUGAR] + [e for e in estados if e["grupo"] == "dead"]:
        if e["cuando"]:
            grupos.setdefault(e["cuando"], []).append(e)
    filas = "".join(
        f'<p><span class="qs">{" · ".join(f"""<b data-estado="{e["id"]}" style="color:{tinte(e)}">{e["id"]}</b>""" for e in juntos)}</span>'
        f'<span class="tx">{prosa(texto)}</span></p>'
        for texto, juntos in grupos.items()
    )
    return f'<section class="card cu"><h2>Cuándo sale</h2><div class="lista">{filas}</div></section>'


def fsm():
    datos = esquema()
    estados, aristas, tiempos = datos["estados"], datos["aristas"], datos["tiempos"]
    sin_lugar = [e["id"] for e in estados if e["id"] not in LUGAR and e["grupo"] != "dead"]
    if sin_lugar:
        sys.exit(f"estado sin lugar en el esquema: {', '.join(sin_lugar)} (LUGAR en {Path(__file__).name})")
    de_mas = [e for e in LUGAR if e not in {x["id"] for x in estados}]
    if de_mas:
        sys.exit(f"lugar sin estado en el enum: {', '.join(de_mas)}")
    indice_orden = {o["nombre"]: o["indice"] for o in datos["ordenes"]}
    salen = sum(1 for a in aristas if a["motivo"] == "sale")
    cabecera = (f'<header class="dos"><h1>Máquina de estados del soldado</h1><span class="eq"><b>{len(estados)}</b> estados · <b>{salen}</b> salidas · '
                f'<b>{tiempos["ticks_por_segundo"]}</b> ticks/s · un tránsito por tick · la orden se cumple desde <b>{datos["cumple_desde"]}</b></span></header>')
    nodos = "".join(nodo(e, tiempos, indice_orden) for e in estados if e["id"] in LUGAR)
    grafo = f'<div class="grafo">{flechas(estados, aristas)}{nodos}{pie_del_grafo(estados, tiempos)}</div>'
    return cabecera + f'<div class="fsm">{grafo}{cuando(estados)}</div>'


def main():
    mono = '"JetBrains Mono","DejaVu Sans Mono",monospace'
    html = f'''<!doctype html><meta charset=utf-8><style>
*{{box-sizing:border-box;margin:0}}
body{{width:{ANCHO}px;height:{ALTO}px;background:radial-gradient(ellipse at 70% 20%,#161b26,#0b0d12 70%);color:#c9ced8;font-family:"Inter","IBM Plex Sans","DejaVu Sans",sans-serif;padding:{MARGEN_ARRIBA}px {MARGEN_X}px 0;overflow:hidden}}
header{{display:flex;align-items:baseline;gap:24px;margin-bottom:10px}} header.dos{{margin-top:8px;margin-bottom:8px}}
h1{{font-size:25px;font-weight:600;color:{TINTA};letter-spacing:.5px}}
.eq{{font:500 17px {mono};color:#8a93a6}} .eq b{{color:{TINTA}}}
.fila{{display:flex;gap:{HUECO}px;align-items:stretch;height:{BANDA_FORMACIONES}px}}
.card{{background:#ffffff08;border:1px solid #ffffff10;border-radius:12px;padding:{PAD_CARD}px}}
.fila .card{{display:flex;flex-direction:column;align-items:center}}
.campo{{flex:1;display:flex;align-items:center}} .campo svg{{display:block;overflow:visible}}
h3{{font-size:25px;font-weight:700;color:{TINTA};letter-spacing:2.5px;margin-top:8px;line-height:1.15}}
.fila p{{font-size:14.5px;color:{TINTA_2};margin-top:2px;white-space:nowrap}}
.num{{font:700 10.5px {mono}}}
.regla{{font:500 12px {mono};fill:{TINTA_3}}}
.fila .ley{{flex:1;align-items:flex-start;justify-content:center;gap:5px;padding-left:26px}}
h2{{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:{TINTA_3};margin-bottom:8px}}
.li{{display:flex;align-items:center;gap:10px;font-size:15.5px;color:{TINTA_2}}} .li svg{{flex:none}} .li b{{color:{TINTA};font-weight:600}}
.mono{{font-family:{mono}}}
.fsm{{display:flex;gap:{HUECO}px;align-items:flex-start}}
.grafo{{position:relative;flex:none;width:{GRAFO_ANCHO}px}}
.hilos{{display:block}}
.nodo{{position:absolute;border-radius:8px;background:color-mix(in srgb,var(--c) 15%,#10131a);border:1px solid color-mix(in srgb,var(--c) 38%,#10131a);border-left:4px solid var(--c);padding:5px 7px 0 8px}}
.nodo .nm{{display:block;font:700 12.5px {mono};color:var(--c);letter-spacing:.2px}}
.nodo .nv{{position:absolute;right:7px;bottom:5px;font:500 11px {mono};color:{TINTA_2}}}
.nodo .ct{{font-size:12px;color:#d5dae3}}
.nodo .sg{{position:absolute;right:6px;top:3px;font-size:12.5px;color:{TINTA};letter-spacing:1.5px}}
.nodo .nt{{position:absolute;left:0;top:100%;margin-top:3px;font-size:11px;color:{TINTA_3};white-space:nowrap}}
.nodo.eje{{padding-top:9px}} .nodo.eje .nm{{font-size:14.5px}} .nodo.eje .sg{{top:8px}} .nodo.eje .ct{{font-size:13px}} .nodo.eje .nv{{bottom:auto;top:31px}}
.nodo.eje .nt{{position:static;display:block;margin-top:3px}}
.or{{position:absolute;left:8px;top:-9px;font:700 9.5px {mono};color:#0b0d12;background:#d9c94a;border-radius:4px;padding:1px 5px;letter-spacing:.3px}}
.or.fijo{{position:static;display:inline-block;font-size:10.5px}}
.al{{position:absolute;right:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:{TINTE["combat"]};border:2px solid #10131a}}
.al.fijo{{position:static;display:inline-block;border:0;width:9px;height:9px;margin-right:6px}}
.pie{{margin-top:2px;font-size:12.5px;color:{TINTA_2}}} .pie b{{color:{TINTA};font-weight:600}}
.ln{{display:flex;align-items:center;gap:16px;margin-top:6px;white-space:nowrap}} .ln.tenue{{color:{TINTA_3};font-size:12px}}
.tt{{color:{TINTA_3}}}
.ficha{{border-radius:6px;background:color-mix(in srgb,var(--c) 15%,#10131a);border-left:4px solid var(--c);padding:3px 9px 3px 7px}} .ficha b{{font:700 12px {mono};color:#c2c8d4;margin-right:4px}}
.cu{{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}}
.fsm>.card.cu{{flex:1;min-width:0;align-self:stretch;display:flex;flex-direction:column;padding:16px 20px 12px}}
.card.cu h2{{margin-bottom:12px}}
.card.cu .lista{{columns:2;column-gap:26px}}
.card.cu p{{break-inside:avoid;display:flex;flex-direction:column;gap:2px;margin:0 0 11px}}
.card.cu .qs{{font:700 12.5px {mono};letter-spacing:.2px;line-height:1.25}}
.card.cu .tx{{font-size:14.5px;line-height:1.38;color:#c5ccd8}}
code{{font:600 13.5px {mono};color:{TINTA}}}
</style>
{formaciones()}
{fsm()}'''
    os.makedirs(SALIDA.parent, exist_ok=True)
    SALIDA.write_text(html, encoding="utf-8")


main()
