/**
 * Multi-tenant: mọi bản ghi gắn org_id từ v1.
 * Hiện chỉ có một tổ chức; sau này lấy từ SSO Google Workspace (hosted domain / claim).
 */
export const DEFAULT_ORG_ID = 'vietanh';

export function getOrgId(_request?: Request): string {
  // TODO: SSO Google Workspace -> org theo miền email.
  return DEFAULT_ORG_ID;
}
