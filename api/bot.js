const dotenv = require("dotenv");
dotenv.config();
const { Bot, webhookCallback, HttpError, GrammyError } = require("grammy");
const imdb = require("name-to-imdb");

// Bot

const bot = new Bot(process.env.BOT_TOKEN);

/// Response

async function responseTime(ctx, next) {
  const before = Date.now();
  await next();
  const after = Date.now();
  console.log(`Response time: ${after - before} ms`);
}

bot.use(responseTime);

// Commands

bot.command("start", async (ctx) => {
  if (!ctx.chat.type == "private") {
    await bot.api.sendMessage(
      ctx.chat.id,
      "*Channels and groups are not supported presently.*",
      { parse_mode: "Markdown" }
    );
    return;
  }
  await ctx
    .reply(
      "*Welcome!* ✨\n_Send the name of a TV show or movie.\nYou can also use inline in chats._",
      {
        parse_mode: "Markdown",
      }
    )
    .then(console.log(`New user added:`, ctx.chat));
});

bot.command("help", async (ctx) => {
  await ctx
    .reply(
      "*@anzubo Project.*\n\n_This is a bot to get IMDb links for media.\nYou can also use it in inline in a chat _",
      { parse_mode: "Markdown" }
    )
    .then(console.log("Help command sent to", ctx.chat.id));
});

// Inline

bot.on("inline_query", async (ctx) => {
  try {
    const query = ctx.inlineQuery.query;
    if (!query) {
      return;
    }
    await imdb(query, async function (err, res, inf) {
      if (err) {
        console.log(err);
      }
      await ctx.answerInlineQuery([
        {
          type: "article",
          id: 1,
          title: `${inf.meta.name} (${inf.meta.year})`,
          description: `${inf.meta.starring}`,
          input_message_content: {
            message_text: `<a href = "https://imdb.com/title/${res}"><b>${inf.meta.name} (${inf.meta.year})</b></a>\n<i>Type: ${inf.meta.type}\nStarring: ${inf.meta.starring}</i>`,
            parse_mode: "HTML",
            disable_web_page_preview: false,
          },
        },
      ]);
    });
  } catch (error) {
    await ctx.answerInlineQuery([]);
  }
});

// Messages

bot.on("message", async (ctx) => {
  // Logging

  const from = ctx.from;
  const name =
    from.last_name === undefined
      ? from.first_name
      : `${from.first_name} ${from.last_name}`;
  console.log(
    `From: ${name} (@${from.username}) ID: ${from.id}\nMessage: ${ctx.msg.text}`
  );

  // Logic

  const statusMessage = await ctx.reply(`*Searching*`, {
    parse_mode: "Markdown",
  });
  async function deleteMessageWithDelay(fromId, messageId, delayMs) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        bot.api
          .deleteMessage(fromId, messageId)
          .then(() => resolve())
          .catch((error) => reject(error));
      }, delayMs);
    });
  }
  await deleteMessageWithDelay(ctx.chat.id, statusMessage.message_id, 3000);

  // Main

  try {
    await imdb(ctx.message.text, async function (err, res, inf) {
      if (err) {
        throw new err();
      }
      if (!inf.meta) {
        return;
      }
      await ctx
        .replyWithPhoto(inf.meta.image.src, {
          caption: `<a href = "https://imdb.com/title/${res}"><b>${inf.meta.name} (${inf.meta.year})</b></a>\n<i>Type: ${inf.meta.type}\nStarring: ${inf.meta.starring}</i>`,

          parse_mode: "HTML",
        })
        .catch(async (e) => {
          await ctx.reply(`An error occurred.\nError:${e.message}`);
        });
    });
  } catch (error) {
    if (error instanceof GrammyError) {
      if (error.message.includes("Forbidden: bot was blocked by the user")) {
        console.log("Bot was blocked by the user");
      } else if (error.includes("Call to 'sendPhoto' failed!")) {
        console.log("Error sending files. Maybe API limit was hit.");
        await ctx.reply(
          `*Error contacting VSCO or Telegram API limit was hit.*`,
          {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.msg.message_id,
          }
        );
      } else {
        await ctx.reply(`*An error occurred: ${error.message}*`, {
          parse_mode: "Markdown",
          reply_to_message_id: ctx.msg.message_id,
        });
      }
      console.log(`Error sending message: ${error.message}`);
      return;
    } else {
      console.log(`An error occured:`, error);
      await ctx.reply(
        `*An error occurred. Are you sure you sent a valid VSCO username?*\n_Error: ${error.message}_`,
        { parse_mode: "Markdown", reply_to_message_id: ctx.msg.message_id }
      );
      return;
    }
  }
});

// Error

bot.catch((err) => {
  const ctx = err.ctx;
  console.error("Error while handling update", ctx.update.update_id);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
    if (e.description === "Forbidden: bot was blocked by the user") {
      console.log("Bot was blocked by the user");
    } else {
      ctx.reply("An error occurred");
    }
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// Run

export default webhookCallback(bot, "http");
