#!/usr/bin/env bash
# Tests for bin/kdx-kill against real processes, a real port and a real transient
# systemd --user unit. Touches nothing that the test did not spawn itself.
set -uo pipefail

KK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/bin/kdx-kill"
export KDX_KILL_NOTIFY=0 KDX_KILL_GRACE=1
pass=0 fail=0
ok()   { echo "  ✔ $1"; pass=$((pass + 1)); }
bad()  { echo "  ✘ $1"; fail=$((fail + 1)); }
gone() { ! kill -0 "$1" 2>/dev/null || [[ "$(ps -o stat= -p "$1")" == Z* ]]; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

echo "kdx-kill tests → $KK"

# grep -c (not -q) on `list`: -q closes the pipe early and pipefail turns SIGPIPE into a false fail.

# 1. plain TERM
setsid sleep 300 & p=$!
"$KK" pid "$p" 2>/dev/null; rc=$?
check "pid: sleep muere con TERM (rc=$rc)" "[[ $rc -eq 0 ]] && gone $p"

# 2. TERM ignored → escalation to KILL
setsid bash -c 'trap "" TERM; while :; do sleep 0.2; done' & p=$!
out="$("$KK" pid "$p" 2>&1)"; rc=$?
check "pid: proceso que ignora TERM muere con KILL (rc=$rc)" "[[ $rc -eq 0 ]] && gone $p && [[ \"$out\" == *KILL* ]]"

# 3. tree: children die with the parent
setsid bash -c 'sleep 301 & sleep 302 & wait' & p=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [[ "$(pgrep -cP "$p")" -ge 2 ]] && break; sleep 0.1; done
kids="$(pgrep -P "$p" | tr '\n' ' ')"
"$KK" pid "$p" 2>/dev/null
alive_kids=0; for k in $kids; do gone "$k" || alive_kids=1; done
check "pid: árbol completo ($p + $kids) muere" "gone $p && [[ -n \"$kids\" && $alive_kids -eq 0 ]]"

# 4. port
PORT=28999
setsid python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 & p=$!
for _ in $(seq 1 30); do ss -Hltn "( sport = :$PORT )" | grep -q . && break; sleep 0.1; done
check "list: muestra el puerto :$PORT" "\"$KK\" list | grep -cP '^port\t$PORT\t' >/dev/null"
"$KK" port "$PORT" 2>/dev/null; rc=$?
check "port: :$PORT liberado (rc=$rc)" "[[ $rc -eq 0 ]] && gone $p && ! ss -Hltn '( sport = :$PORT )' | grep -q ."
"$KK" port "$PORT" 2>/dev/null; rc=$?
check "port: puerto vacío devuelve 1" "[[ $rc -eq 1 ]]"

# 5. systemd --user unit
U=kdx-kill-test-$$
systemd-run --user --quiet --unit="$U" sleep 300
check "list: muestra la unidad $U" "\"$KK\" list | grep -cP '^svc\t$U.service\t' >/dev/null"
"$KK" svc "$U" 2>/dev/null; rc=$?
check "svc: $U detenida (rc=$rc)" "[[ $rc -eq 0 ]] && ! systemctl --user is-active --quiet $U.service"

# 6. protection (overrides so nothing real is at stake)
setsid sleep 303 & p=$!
KDX_KILL_PROTECT_PROC='^sleep$' "$KK" pid "$p" 2>/dev/null; rc=$?
check "protect: comm protegido se rechaza con 3 y sigue vivo" "[[ $rc -eq 3 ]] && ! gone $p"
check "protect: comm protegido no aparece en list" "! KDX_KILL_PROTECT_PROC='^sleep$' \"$KK\" list | grep -cP '^proc\t$p\t' >/dev/null"
kill -KILL "$p" 2>/dev/null

U2=kdx-kill-guard-$$
systemd-run --user --quiet --unit="$U2" sleep 300
KDX_KILL_PROTECT_UNIT="^$U2\\.service\$" "$KK" svc "$U2" 2>/dev/null; rc=$?
check "protect: unidad protegida se rechaza con 3 y sigue activa" "[[ $rc -eq 3 ]] && systemctl --user is-active --quiet $U2.service"
systemctl --user stop "$U2.service"

"$KK" pid $$ 2>/dev/null; rc=$?
check "protect: no mata a su propio ancestro (rc=$rc)" "[[ $rc -eq 3 ]]"
"$KK" pid 1 2>/dev/null; rc=$?
check "protect: PID 1 rechazado" "[[ $rc -eq 3 ]]"
check "protect: defaults ocultan pipewire/Hyprland/ags-hyprland de list" \
  "! \"$KK\" list | grep -cP '% (pipewire|Hyprland|kitty) —|^svc\tags-hyprland' >/dev/null"

# 7. picker row dispatch
setsid sleep 304 & p=$!
"$KK" do "$(printf 'proc\t%s\tsleep' "$p")" 2>/dev/null
check "do: fila proc del picker mata el PID" "gone $p"
"$KK" bogus >/dev/null 2>&1; rc=$?
check "uso inválido devuelve 2" "[[ $rc -eq 2 ]]"

echo "resultado: $pass ok · $fail fallos"
[[ $fail -eq 0 ]]
