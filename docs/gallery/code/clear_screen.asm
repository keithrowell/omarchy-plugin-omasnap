* CLEAR SCREEN, PRINT A GREETING - HITACHI BASIC MASTER (6809)
SCREEN  EQU     $0200
OUTCH   EQU     MONITOR+3

        ORG     $0300
CLRSCR  LDX     #SCREEN
        LDB     #32*16
        LDA     #$20
LOOP    STA     ,X+
        DECB
        BNE     LOOP
        LDX     #MSG
PRINT   LDA     ,X+
        BEQ     DONE
        JSR     OUTCH
        BRA     PRINT
DONE    RTS

MSG     FCC     "HELLO, BASIC MASTER"
        FCB     0
