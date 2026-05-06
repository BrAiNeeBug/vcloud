#Region ;**** Directives created by AutoIt3Wrapper_GUI ****
#AutoIt3Wrapper_UseUpx=y
#AutoIt3Wrapper_Res_Fileversion=1.0.0.0
#AutoIt3Wrapper_Res_Language=1033
#AutoIt3Wrapper_Res_requestedExecutionLevel=None
#AutoIt3Wrapper_Add_Includes=n
#AutoIt3Wrapper_AU3Check_Stop_OnWarning=y
#AutoIt3Wrapper_AU3Check_Parameters=-w 1 -w 2 -w- 4 -w 6
#AutoIt3Wrapper_Run_Stop_OnError=y
#AutoIt3Wrapper_Run_Tidy=y
#Tidy_Parameters=/rel
#AutoIt3Wrapper_Run_Au3Stripper=y
#Au3Stripper_Parameters=/so /rm
#EndRegion ;**** Directives created by AutoIt3Wrapper_GUI ****
#include-once
#include <GDIPlus.au3>
#include <Timers.au3>
#include <WindowsStylesConstants.au3>
Global $sText = @UserName
; Pac-Man: [x, y, r, colorIdx, vx, vy, mouthOpen, mouthDir]
;   mouthOpen = aktueller Mundwinkel in Grad (0..40), schwingt hin+her
;   mouthDir  = 1 öffnen, -1 schließen
Global $aPac[1][8], $iPac = 0
;~ _screensaver() ; turn on for testing
Func _screensaver()
	Local $SM_XVIRTUALSCREEN = 76
	Local $SM_YVIRTUALSCREEN = 77
	Local $SM_CXVIRTUALSCREEN = 78
	Local $SM_CYVIRTUALSCREEN = 79
	Local $iX = DllCall("user32.dll", "int", "GetSystemMetrics", "int", $SM_XVIRTUALSCREEN)[0]
	Local $iY = DllCall("user32.dll", "int", "GetSystemMetrics", "int", $SM_YVIRTUALSCREEN)[0]
	Local $iW = DllCall("user32.dll", "int", "GetSystemMetrics", "int", $SM_CXVIRTUALSCREEN)[0]
	Local $iH = DllCall("user32.dll", "int", "GetSystemMetrics", "int", $SM_CYVIRTUALSCREEN)[0]
	Local $padX = Int($iW * 0.12)
	Local $padY = Int($iH * 0.12)
	$iX -= $padX
	$iY -= $padY
	$iW += $padX * 2
	$iH += $padY * 2
	Local $iSW = $iW
	Local $iSH = $iH
	Local $SSGUI = GUICreate("☺", $iSW, $iSH, $iX, $iY, $WS_POPUP, $WS_EX_TOPMOST)
	GUISetBkColor(0x000000)
	GUISetState()
	_GDIPlus_Startup()
	Local $hGfx = _GDIPlus_GraphicsCreateFromHWND($SSGUI)
	_GDIPlus_GraphicsClear($hGfx, 0xFF000000)
	Local $hBlack = _GDIPlus_BrushCreateSolid(0xFF000000)
	Sleep(1000)
	_SpawnPac($iSW, $iSH)
	While _Timer_GetIdleTime() > 50
		; Pac-Men bewegen + zeichnen
		_UpdatePac($hGfx, $hBlack, $iSW, $iSH)
		; Zufälliger Neon-Hintergrundeffekt
		Local $iType = Random(1, 60, 1)
		Switch $iType
			Case 1
				_DrawNeonLine($hGfx, $iSW, $iSH)
			Case 2
				_DrawNeonText($hGfx, $iSW, $iSH)
			Case 3
				_DrawNeonClock($hGfx, $iSW, $iSH)
			Case 4
				_DrawNeonStar($hGfx, $iSW, $iSH)
			Case 5
				_DrawNeonTriangle($hGfx, $iSW, $iSH)
			Case 6
				_DrawBgBlob($hGfx, $iSW, $iSH)
			Case Else
				_DrawNeonParticle($hGfx, $iSW, $iSH)
		EndSwitch
		Sleep(30)
	WEnd
	_GDIPlus_BrushDispose($hBlack)
	_GDIPlus_GraphicsDispose($hGfx)
	_GDIPlus_Shutdown()
	GUIDelete($SSGUI)
EndFunc   ;==>_screensaver
; ================================================================
;  Pac-Man System
; ================================================================
Func _SpawnPac($iSW, $iSH)
	ReDim $aPac[$iPac + 1][8]
	$aPac[$iPac][0] = Random(30, $iSW - 30)     ; x
	$aPac[$iPac][1] = Random(30, $iSH - 30)     ; y
	$aPac[$iPac][2] = Random(18, 30, 1)          ; r — deutlich größer als statische Partikel (r 2-5)
	$aPac[$iPac][3] = Random(0, 5, 1)            ; colorIdx (neon oder gelb — Index 3 = Orange ≈ gelb)
	Local $vx = Random(-5, 5)
	If Abs($vx) < 1 Then $vx = 2
	Local $vy = Random(-5, 5)
	If Abs($vy) < 1 Then $vy = 2
	$aPac[$iPac][4] = $vx                        ; vx
	$aPac[$iPac][5] = $vy                        ; vy
	$aPac[$iPac][6] = Random(5, 35, 1)           ; mouthOpen (Grad)
	$aPac[$iPac][7] = 1                          ; mouthDir: 1=öffnen -1=schließen
	$iPac += 1
EndFunc   ;==>_SpawnPac
Func _UpdatePac(ByRef $hGfx, ByRef $hBlack, $iSW, $iSH)
	For $i = 0 To $iPac - 1
		Local $x = $aPac[$i][0]
		Local $y = $aPac[$i][1]
		Local $r = $aPac[$i][2]
		; Alte Position löschen (quadratisch damit auch Mund-Ecken weg sind)
		_GDIPlus_GraphicsFillRect($hGfx, $x - $r - 3, $y - $r - 3, ($r + 3) * 2, ($r + 3) * 2, $hBlack)
		; Bewegung
		$aPac[$i][0] += $aPac[$i][4]
		$aPac[$i][1] += $aPac[$i][5]
		If $aPac[$i][0] < $r + 3 Or $aPac[$i][0] > $iSW - $r - 3 Then $aPac[$i][4] *= -1
		If $aPac[$i][1] < $r + 3 Or $aPac[$i][1] > $iSH - $r - 3 Then $aPac[$i][5] *= -1
		; Mund animieren
		$aPac[$i][6] += $aPac[$i][7] * 5
		If $aPac[$i][6] >= 40 Then $aPac[$i][7] = -1
		If $aPac[$i][6] <= 2 Then $aPac[$i][7] = 1
		$x = $aPac[$i][0]
		$y = $aPac[$i][1]
		Local $mouth = $aPac[$i][6]   ; halber Mundwinkel in Grad
		; Fahrtrichtung → Drehwinkel berechnen
		; atan2 gibt Winkel in Rad, GDI+ DrawPie braucht Grad (0=3-Uhr, +CW)
		Local $rot = _RadToDeg(ATan($aPac[$i][5] / ($aPac[$i][4] + 0.0001)))
		If $aPac[$i][4] < 0 Then $rot += 180   ; linke Halbebene korrigieren
		; GDI+ FillPie: startAngle = Fahrtrichtung + halber Mund, sweepAngle = 360 - Mundöffnung
		Local $startAngle = $rot + $mouth
		Local $sweepAngle = 360 - ($mouth * 2)
		Local $hBrush = _GDIPlus_BrushCreateSolid(_NeonIdx($aPac[$i][3], 0xCA))
		_GDIPlus_GraphicsFillPie($hGfx, $x - $r, $y - $r, $r * 2, $r * 2, $startAngle, $sweepAngle, $hBrush)
		_GDIPlus_BrushDispose($hBrush)
		; Auge — kleiner schwarzer Punkt oben-rechts relativ zur Fahrtrichtung
		Local $eyeAngle = $rot - 60   ; 60° über Mittellinie
		Local $eyeX = $x + ($r * 0.5) * Cos(_DegToRad($eyeAngle))
		Local $eyeY = $y + ($r * 0.5) * Sin(_DegToRad($eyeAngle))
		Local $hEye = _GDIPlus_BrushCreateSolid(0xFF000000)
		_GDIPlus_GraphicsFillEllipse($hGfx, $eyeX - 2, $eyeY - 2, 4, 4, $hEye)
		_GDIPlus_BrushDispose($hEye)
	Next
EndFunc   ;==>_UpdatePac
Func _RadToDeg($r)
	Return $r * 180 / 3.14159265
EndFunc   ;==>_RadToDeg
Func _DegToRad($d)
	Return $d * 3.14159265 / 180
EndFunc   ;==>_DegToRad
; ================================================================
;  Neon-Effekte
; ================================================================
; Zeichnet einen leuchtenden Kreis mit mehreren Alpha-Ebenen (Glow)
Func _DrawNeonParticle(ByRef $hGfx, $iSW, $iSH)
	Local $x = Random(10, $iSW - 10)
	Local $y = Random(10, $iSH - 10)
	Local $r = Random(1, 6, 1)
	Local $ci = Random(0, 5, 1)
	; Glow: von außen nach innen, abnehmende Transparenz
	For $g = 3 To 0 Step -1
		Local $alpha = 0x20 + $g * 0xff
		Local $hB = _GDIPlus_BrushCreateSolid(_NeonIdx($ci, $alpha))
		_GDIPlus_GraphicsFillEllipse($hGfx, $x - $r - $g * 3, $y - $r - $g * 3, ($r + $g * 3) * 2, ($r + $g * 3) * 2, $hB)
		_GDIPlus_BrushDispose($hB)
	Next
EndFunc   ;==>_DrawNeonParticle
Func _DrawNeonLine(ByRef $hGfx, $iSW, $iSH)
	Local $x1 = Random(0, $iSW), $y1 = Random(0, $iSH)
	Local $x2 = Random(0, $iSW), $y2 = Random(0, $iSH)
	Local $ci = Random(0, 5, 1)
	;glow
	Local $hPenG = _GDIPlus_PenCreate(_NeonIdx($ci, 0x25), 4)
	_GDIPlus_GraphicsDrawLine($hGfx, $x1, $y1, $x2, $y2, $hPenG)
	_GDIPlus_PenDispose($hPenG)
	;scharf
	Local $hPen = _GDIPlus_PenCreate(_NeonIdx($ci, 0x50), 1)
	_GDIPlus_GraphicsDrawLine($hGfx, $x1, $y1, $x2, $y2, $hPen)
	_GDIPlus_PenDispose($hPen)
EndFunc   ;==>_DrawNeonLine
Func _DrawNeonText(ByRef $hGfx, $iSW, $iSH)
	Local $x = Random(0, $iSW - 400), $y = Random(0, $iSH - 80)
	Local $sz = Random(18, 48, 1)
	Local $ci = Random(0, 5, 1)
	; Glow-Pass
	Local $hFamG = _GDIPlus_FontFamilyCreate("Segoe UI")
	Local $hFntG = _GDIPlus_FontCreate($hFamG, $sz + 3)
	Local $hFmtG = _GDIPlus_StringFormatCreate()
	Local $hBrushG = _GDIPlus_BrushCreateSolid(_NeonIdx($ci, 0xBA))
	Local $tLayG = _GDIPlus_RectFCreate($x - 2, $y - 2, 1200, 300)
	_GDIPlus_GraphicsDrawStringEx($hGfx, $sText, $hFntG, $tLayG, $hFmtG, $hBrushG)
	_GDIPlus_BrushDispose($hBrushG)
	_GDIPlus_FontDispose($hFntG)
	_GDIPlus_FontFamilyDispose($hFamG)
	_GDIPlus_StringFormatDispose($hFmtG)
EndFunc   ;==>_DrawNeonText
Func _DrawNeonClock(ByRef $hGfx, $iSW, $iSH)
	Local $sTime = @HOUR & ":" & StringFormat("%02d", @MIN) & ":" & StringFormat("%02d", @SEC)
	Local $x = Random(0, $iSW - 500), $y = Random(0, $iSH - 120)
	Local $sz = Random(40, 80, 1)
	Local $ci = Random(0, 5, 1)
	; Glow-Pass
	Local $hFamG = _GDIPlus_FontFamilyCreate("Consolas")
	Local $hFntG = _GDIPlus_FontCreate($hFamG, $sz + 4)
	Local $hFmtG = _GDIPlus_StringFormatCreate()
	Local $hBrushG = _GDIPlus_BrushCreateSolid(_NeonIdx($ci, 0xAA))
	Local $tLayG = _GDIPlus_RectFCreate($x - 3, $y - 3, 700, 200)
	_GDIPlus_GraphicsDrawStringEx($hGfx, $sTime, $hFntG, $tLayG, $hFmtG, $hBrushG)
	_GDIPlus_BrushDispose($hBrushG)
	_GDIPlus_FontDispose($hFntG)
	_GDIPlus_FontFamilyDispose($hFamG)
	_GDIPlus_StringFormatDispose($hFmtG)
EndFunc   ;==>_DrawNeonClock
Func _DrawNeonStar(ByRef $hGfx, $iSW, $iSH)
	Local $cx = Random(50, $iSW - 50), $cy = Random(50, $iSH - 50)
	Local $r1 = Random(15, 60, 1), $r2 = Int($r1 * 0.4)
	Local $ci = Random(0, 5, 1)
	Local $pts[11][2]
	For $i = 0 To 9
		Local $ang = ($i * 36 - 90) * 3.14159265 / 180
		If Mod($i, 2) = 0 Then
			$pts[$i][0] = $cx + $r1 * Cos($ang)
			$pts[$i][1] = $cy + $r1 * Sin($ang)
		Else
			$pts[$i][0] = $cx + $r2 * Cos($ang)
			$pts[$i][1] = $cy + $r2 * Sin($ang)
		EndIf
	Next
	Local $hPenG = _GDIPlus_PenCreate(_NeonIdx($ci, 0x45), 9)   ; dicker + heller Glow
	Local $hPen = _GDIPlus_PenCreate(_NeonIdx($ci, 0x85), 2)    ; scharfe Linie
	For $i = 0 To 9
		Local $jn = $i + 1
		If $i = 9 Then $jn = 0
		_GDIPlus_GraphicsDrawLine($hGfx, $pts[$i][0], $pts[$i][1], $pts[$jn][0], $pts[$jn][1], $hPenG)
		_GDIPlus_GraphicsDrawLine($hGfx, $pts[$i][0], $pts[$i][1], $pts[$jn][0], $pts[$jn][1], $hPen)
	Next
	_GDIPlus_PenDispose($hPenG)
	_GDIPlus_PenDispose($hPen)
EndFunc   ;==>_DrawNeonStar
Func _DrawNeonTriangle(ByRef $hGfx, $iSW, $iSH)
	Local $cx = Random(40, $iSW - 40), $cy = Random(40, $iSH - 40)
	Local $r = Random(20, 70, 1), $ci = Random(0, 5, 1)
	Local $x1 = $cx + $r * Cos(-1.5708), $y1 = $cy + $r * Sin(-1.5708)
	Local $x2 = $cx + $r * Cos(-1.5708 + 2.0944), $y2 = $cy + $r * Sin(-1.5708 + 2.0944)
	Local $x3 = $cx + $r * Cos(-1.5708 + 4.1888), $y3 = $cy + $r * Sin(-1.5708 + 4.1888)
	Local $hPenG = _GDIPlus_PenCreate(_NeonIdx($ci, 0x45), 9)   ; dicker + heller Glow
	_GDIPlus_GraphicsDrawLine($hGfx, $x1, $y1, $x2, $y2, $hPenG)
	_GDIPlus_GraphicsDrawLine($hGfx, $x2, $y2, $x3, $y3, $hPenG)
	_GDIPlus_GraphicsDrawLine($hGfx, $x3, $y3, $x1, $y1, $hPenG)
	_GDIPlus_PenDispose($hPenG)
	Local $hPen = _GDIPlus_PenCreate(_NeonIdx($ci, 0x85), 2)   ; scharfe Linie
	_GDIPlus_GraphicsDrawLine($hGfx, $x1, $y1, $x2, $y2, $hPen)
	_GDIPlus_GraphicsDrawLine($hGfx, $x2, $y2, $x3, $y3, $hPen)
	_GDIPlus_GraphicsDrawLine($hGfx, $x3, $y3, $x1, $y1, $hPen)
	_GDIPlus_PenDispose($hPen)
EndFunc   ;==>_DrawNeonTriangle
Func _DrawBgBlob(ByRef $hGfx, $iSW, $iSH)
	Local $x = Random(0, $iSW), $y = Random(0, $iSH)
	Local $rW = Random(10, 100, 1), $rH = Random(10, 100, 1)
	Local $ci = Random(0, 5, 1)
	; Glow-Ring außen
	Local $hBG = _GDIPlus_BrushCreateSolid(_NeonIdx($ci, 0x35))
	_GDIPlus_GraphicsFillEllipse($hGfx, $x - 20, $y - 20, $rW + 40, $rH + 40, $hBG)
	_GDIPlus_BrushDispose($hBG)
	; Blob selbst
	Local $hB = _GDIPlus_BrushCreateSolid(_NeonIdx($ci, 0x45))
	_GDIPlus_GraphicsFillEllipse($hGfx, $x, $y, $rW, $rH, $hB)
	_GDIPlus_BrushDispose($hB)
EndFunc   ;==>_DrawBgBlob
Func _NeonIdx($iIdx, $iAlpha = 0xFF)
	Local $aNeon[6] = [0xFFFF00CC, 0xFF00FFFF, 0xFF39FF14, 0xFFFF6600, 0xFF7B2FFF, 0xFF0080FF]
	Local $sBase = Hex($aNeon[$iIdx])
	Return "0x" & StringFormat("%02X", $iAlpha) & StringRight($sBase, 6)
EndFunc   ;==>_NeonIdx
