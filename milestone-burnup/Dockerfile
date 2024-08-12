FROM denoland/deno:latest

RUN PUPPETEER_PRODUCT=chrome deno run -A --unstable https://deno.land/x/puppeteer@16.2.0/install.ts

ADD . /app
WORKDIR /app

# deno run --allow-all milestone-burndown.ts
ENTRYPOINT [ "deno", "run", "--allow-all", "/app/milestone-burnup.ts" ]
