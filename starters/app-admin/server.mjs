import { createApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { googleProvider, mailProvider } from "./providers.mjs";

const config = await loadConfig();
const server = await createApp({ config, sendEmail: mailProvider(config), google: googleProvider(config) });
server.listen(config.port, "127.0.0.1", () => console.log(`App starter listening on port ${config.port}.`));
