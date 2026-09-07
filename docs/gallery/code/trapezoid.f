      PROGRAM TRAPZ
C     TRAPEZOIDAL RULE: INTEGRATE X*X FROM 0 TO 1
      REAL A, B, H, X, SUM
      INTEGER N, I
      A = 0.0
      B = 1.0
      N = 100
      H = (B - A) / N
      SUM = 0.5 * (A*A + B*B)
      DO 10 I = 1, N - 1
        X = A + I * H
        SUM = SUM + X * X
   10 CONTINUE
      SUM = SUM * H
      PRINT *, 'INTEGRAL = ', SUM
      STOP
      END
