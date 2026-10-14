// The one Vercel Function (#105): every /api/* request is rewritten here
// (vercel.json) and routed in server/handleApiRequest.ts. Keep other modules
// out of api/: Vercel deploys each file in it as a function of its own.
// The `.js` extension is what Node's ES modules need once Vercel compiles this.
import { handleApiRequest } from "../server/handleApiRequest.js";

export default {
  fetch(request: Request): Promise<Response> {
    return handleApiRequest(request, process.env);
  },
};
