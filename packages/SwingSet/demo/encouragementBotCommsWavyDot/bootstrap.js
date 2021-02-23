import { Far } from '@agoric/marshal';

// This javascript source file uses the "tildot" syntax (foo~.bar()) for
// eventual sends.
// https://agoric.com/documentation/ertp/guide/other-concepts.html
//  Tildot is standards track with TC39, the JavaScript standards committee.
// https://github.com/tc39/proposal-wavy-dot

console.log(`=> loading bootstrap.js`);

export function buildRootObject(vatPowers) {
  const { D, testLog: log } = vatPowers;
  return Far('root', {
    async bootstrap(vats, devices) {
      console.log('=> bootstrap() called');

      const BOT = 'bot';
      const USER = 'user';
      const BOT_CLIST_INDEX = 0;

      D(devices.loopbox).registerInboundHandler(USER, vats.uservattp);
      const usersender = D(devices.loopbox).makeSender(USER);
      await vats.uservattp~.registerMailboxDevice(usersender);
      const {
        transmitter: txToBotForUser,
        setReceiver: setRxFromBotForUser,
      } = await vats.uservattp~.addRemote(BOT);
      const rxFromBotForUser = await vats.usercomms~.addRemote(BOT, txToBotForUser, setRxFromBotForUser);

      D(devices.loopbox).registerInboundHandler(BOT, vats.botvattp);
      const botsender = D(devices.loopbox).makeSender(BOT);
      await vats.botvattp~.registerMailboxDevice(botsender);
      const {
        transmitter: txToUserForBot,
        setReceiver: setRxFromUserForBot,
      } = await vats.botvattp~.addRemote(USER);
      const rxFromUserForBot = await vats.botcomms~.addRemote(USER, txToUserForBot, setRxFromUserForBot);

      await vats.botcomms~.addEgress(
        USER,
        BOT_CLIST_INDEX, // this would normally be autogenerated
        vats.bot,
      );

      const pPBot = vats.usercomms~.addIngress(BOT, BOT_CLIST_INDEX);
      vats.user
        ~.talkToBot(pPBot, 'bot')
        .then(
          r => log(`=> the promise given by the call to user.talkToBot resolved to '${r}'`),
          err => log(`=> the promise given by the call to user.talkToBot was rejected '${err}''`),
        );
    },
  });
}
