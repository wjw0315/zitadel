import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';

import { AdminServiceClient } from '../proto/generated/zitadel/AdminServiceClientPb';
import { AuthServiceClient } from '../proto/generated/zitadel/AuthServiceClientPb';
import { ManagementServiceClient } from '../proto/generated/zitadel/ManagementServiceClientPb';

interface Environment {
  api: string;
  clientid: string;
  issuer: string;
  customer_portal?: string;
  instance_management_url?: string;
}

interface WellKnown {
  authorization_endpoint: string;
  end_session_endpoint: string;
  introspection_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

@Injectable({
  providedIn: 'root',
})
export class EnvironmentService {
  private exhaustedCookieKey = 'zitadel.quota.limiting';
  private environmentJsonPath = './assets/environment.json';
  private wellknownPath = '/.well-known/openid-configuration`';
  public auth!: AuthServiceClient;
  public mgmt!: ManagementServiceClient;
  public admin!: AdminServiceClient;

  constructor(private http: HttpClient) {}

  private environment$ = of(null).pipe(
    // Delete the exhausted cookie before the enviroment is loaded
    tap(() => (document.cookie = `${this.exhaustedCookieKey}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC"`)),
    switchMap(() => {
      // Wait until the browser deleted the cookie
      return new Promise<void>((resolve) => {
        const checkCookie = () => {
          if (this.hasExhaustedCookie) {
            setTimeout(checkCookie, 10);
          } else {
            resolve();
          }
        };
        checkCookie();
      });
    }),
    switchMap(() => {
      // Get environment.json
      return this.http.get<Environment>(this.environmentJsonPath).pipe(
        map((env) => {
          return env;
        }),
        catchError((err) => {
          console.error('Getting environment.json failed', err);
          return throwError(() => err);
        }),
      );
    }),
    // Cache the first response, then replay it
    shareReplay(1),
  );

  private wellKnown$ = this.environment$.pipe(
    catchError((err) => {
      console.error('Getting well-known OIDC configuration failed', err);
      return throwError(() => err);
    }),
    switchMap((env) => {
      return this.http.get<WellKnown>(`${env.issuer}${this.wellknownPath}`);
    }),
    // Cache the first response, then replay it
    shareReplay(1),
  );

  get env() {
    return this.environment$;
  }

  get wellKnown() {
    return this.wellKnown$;
  }

  get hasExhaustedCookie() {
    return !!document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${this.exhaustedCookieKey}=`));
  }
}
