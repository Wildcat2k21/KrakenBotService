const QRCode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

//пользовательские модули
const {TextDayFormat, Buttons, FormatBytes,
WriteInLogFile, STATE} = require('./modules/Other');
const checkConfigFields = require('./modules/Data');
const APIserver = require('./modules/APIserver');

//конфигурация
let config = require('./config.json');
const Time = require('./modules/Time');

//основная настройка
const app = express();
app.use(express.json());

//основная конфигурация
const PORT = process.env.PORT || 4040;
const ADMIN_TELEGRAN_ID = Number(process.env.ADMIN_TELEGRAN_ID);
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

//создаем бота
const bot = new TelegramBot(TOKEN, { polling: true });

//хранилище состояний пользователей
let userStates = [];

String.prototype.format = function () {
    return this.replace(/ {2,}/g, ' ').replace(/((?=\n)\s+)|\n/g, '').replace(/\/n/g, '\n');
}

//оповещение основных событий
app.post('/notify' , (req, res) => {
    const {users} = req.body;

    try{
        //рассылка для каждого пользователя
        users.forEach(user => {

            //данные для отправки уведомлений
            const {id, message, control, withDefaultOptions, sticker} = user;
            
            //проверка данных
            if(!id || !message) throw new Error('Не передан идентификатор или сообщение');

            //опции
            let notify = {
                id,
                message,
                options: null,
                sticker: null,
            };

            //управление заявками для администратора
            if(control){

                //управление входящими заявками
                if(control.action === 'accept offer'){

                    //поиск подминистратора
                    const adminState = userStates.find(state => state.telegramId === ADMIN_TELEGRAN_ID);

                    if(!adminState) return;
    
                    //оповещение о принятии или отклонении заявки
                    notify.options = Buttons([[
                        { text: '✅ Принять', callback_data: `AcceptOffer=${control.offer_id}` },
                        { text: '❌ Отклонить', callback_data: `RejectOffer=${control.offer_id}` },
                    ]])
                }

                //управление входящими заявками
                if(control.action === 'instruction'){
                    notify.options = instructionOptions().options;
                }
            }
            
            //использование опций
            if(withDefaultOptions){
                notify.options = mainMenuOptions();
            }

            //опции по умолчанию
            if(!withDefaultOptions && !control){
                notify.options = {parse_mode: 'HTML'}
            }

            //прикреп стикера c сообщением
            if(sticker){
                bot.sendSticker(notify.id, sticker).then(() => {
                    bot.sendMessage(notify.id, notify.message.format(), notify.options);
                });
                
                return;
            }

            //отправка сообщения пользователю
            bot.sendMessage(notify.id, notify.message.format(), notify.options);
        });

        res.status(200).send('ok');

    }
    catch(err){
        WriteInLogFile(err);
        res.status(400).send('Невозможно обработать запрос');
    }
});

//изменение конфигурации
app.post('/config', async (req, res) => {
    try {
        //проверка корректности полей конфигурации
        checkConfigFields(req.body);
        
        await fs.writeFile('./config.json', JSON.stringify(req.body, null, 2));

        //изменение конфигурации сервера
        config = req.body;
        res.status(200).send('ok');
    }
    catch(err){

        //ошибка вызванная проверкой check
        if(err.dataCheck){
            return res.status(417, err.message).send();;
        }

        WriteInLogFile(err);

        // Ппроверяем, если ошибка возникла при проверке конфигурации
        if (err.message) {
            res.status(417).send(err.message);
        }
        else {
            res.status(500).send('Невозможно обновить конфигурацию');
        }
    }
});

//отправка конфигурации
app.get('/config', (req, res) => {
    res.status(200).json(config)
});

//завершение работы сервера
app.post('/stop', (req, res) => {

    //остановка бот-сервиса
    bot.stopPolling();
    res.status(200).send('ok');

    //закрытие сервера
    server.close(() => {
        WriteInLogFile('Server stopped');
        process.exit(0);
    });
})

//очистка логов 
app.post('/logs', async (req, res) => {
    try {
        await fs.writeFile('logs.txt', ''); // Очищаем файл логов
        res.status(200).send('ok');
    }
    catch (err) {
        WriteInLogFile(err);
        res.status(500).send('Невозможно почистить файл логов');
    }
});

//отправка логов
app.get('/logs', async (req, res) => {
    try{
        const logs = await fs.readFile('logs.txt', 'utf-8');
        res.status(200).send(logs);
    }
    catch(err){
        WriteInLogFile(err);
        res.status(500).send('Невозможно отправить данные');
    }
});

//запуск сервера
const server = app.listen(PORT, async () => {
    console.clear();
    WriteInLogFile(`Сервер запущен на порту ${PORT} 👂`);
});

async function initProperties(sender, refCode){
    
    //идентификатор пользователя
    const telegramId = sender.id;

    //приветственное сообщение для администратора
    if(sender.id === ADMIN_TELEGRAN_ID){
        await bot.sendMessage(telegramId, `Администратор распознан. Вы будете получать уведомления о новых пользователях, 
        заявках и прочую информацию`.format());
    }

    let userData = null;

    //поиск пользователя
    userData = await APIserver.FIND_USER(telegramId);

    //если пользователь найден
    if(userData){

        //новое сосотояние
        const options = mainMenuOptions(telegramId);
        const userState = STATE({telegramId, data : {}, action: null, step: null, options, telegram: userData.telegram})

        bot.sendMessage(telegramId, `Рады вас видеть! ${userData.nickname} 👋👋👋`, options);

        //инициализация пустого сценария
        userStates.push(userState);

        return

    }
    //приветственное сообщение от сервера
    else {

        //проверка на наличие имени пользователя в телеграм
        if(!sender.username){
            await bot.sendMessage(telegramId, `Похоже, что вы не указали имя в телеграм при регистрации ℹ️/n/n
                Ваше имя будет использоваться для удобства связи с вами в случае необходимости. 
                Откройте настройки, и укажите его в графе "Имя пользователя", чтобы продолжить./n/n
                ⚙️ Настройки ➡️ Имя пользователя
            `.format(), Buttons([[
                {text: 'Готово 👌', callback_data: 'new offer'}
            ]]));

            return
        }

        //регистрация пользователя
        const registrationData = {
            telegram: sender.username,
            nickname: sender.first_name,
            telegram_id: telegramId
        }

        //получение инвайта
        if(refCode){
            //проверка на существование инвайта
            const userWithThisInvite = await APIserver.FIND_USER_WITH_INVITE(refCode);

            //установка кода приглашения
            if(userWithThisInvite){
                registrationData.invited_with_code = refCode;
            }
        }

        // регистрация пользователя
        await APIserver.NEW_USER(registrationData);

        //конфигурация
        const apiServerConfig = await APIserver.GET_CONF();

        //опции для пользователя
        const options = mainMenuOptions(telegramId);

        //новое сосотояние
        const userState = STATE({telegramId, telegram: sender.username, data : {
            sub_id: 'free',
            user_id: telegramId
        }, action: null, step: null, options});

        //добавление сценария
        userStates.push(userState);

        //получение строки подключения
        //const connection = await createNewoffer(userState, true);

        bot.sendMessage(telegramId, apiServerConfig.welcome_message, options);

        // + `/n/n
        // <b>Ваша строка для подключения к VPN 🔥</b>/n
        // <pre><code>
        //     ${connection}
        // </code></pre>/n/n
        // Если не подключались ранее, выберите опцию <b>"Как подключится"</b> ниже 👇
        // `.format(), options);

        return
    }
}

//обработка соощений от пользователя
bot.on('message', async (msg) => {

    //идентификатор пользователя
    let state, telegramId = msg.from.id;

    try{
        //реферальный код и проверка состояния
        const refCode = msg.text.match(/\/start\s?(.*)/g) ? msg.text.split(' ')[1] : null;
        state = userStates.find(item => item.telegramId === telegramId);

        if(!state) return await initProperties(msg.from, refCode);

        //ввод промокода пользователем
        if(state.action === 'awaiting promocode'){

            //проверка на длинну промокода
            if(msg.text.length > 10) {
                bot.sendMessage(telegramId, 'Введенный промокод слишком длинный 🔂', state.options);
                return
            }

            state.data.promo_id = msg.text;
            return await createNewoffer(state);
        }

        //сообщение по умолчанию
        bot.sendMessage(telegramId, '❓Команда не распознана', state.options);
    }
    catch(err){

        //лог ошибки
        WriteInLogFile(err);

        //обработка ошибок axios
        if(err.response && typeof err.response.data === 'string'){

            //проверка промокода
            if(state && state.action === 'awaiting promocode' && err.response.data.startsWith('Промокод')){
                bot.sendMessage(telegramId, err.response.data + ' 🔂', state.options);
                return
            }

            const errorStatusMess = `${err.response.status} ${err.response.statusText}`;
        
            if(state) state.default();

            bot.sendMessage(telegramId, err.response.data || errorStatusMess);
            return;
        }

        //сброс сосотояния
        if(state) state.default();

        bot.sendMessage(telegramId, config.default_error_message);
    }
});
  
//обработка кликов по кнопкам
bot.on('callback_query', async (query) => {

    //телеграм пользователя
    let state, telegramId = query.from.id;

    try{

        //проверка состояния
        state = userStates.find(item => item.telegramId === telegramId);

        if(!state) return await initProperties(query.from);

        //принятие новой заявки
        if(state.telegramId === ADMIN_TELEGRAN_ID && query.data.match('AcceptOffer=')){
            const offerId = query.data.split('=')[1];
            return await APIserver.ACCEPT_OFFER(offerId);
        }

        //отклонение новой заявки
        if(state.telegramId === ADMIN_TELEGRAN_ID && query.data.match('RejectOffer=')){
            const offerId = query.data.split('=')[1];
            return await APIserver.REJECT_OFFER(offerId);
        }

        //просмотр всех заявок
        if(state.telegramId === ADMIN_TELEGRAN_ID && query.data === 'pending offers'){
            const newOffers = await APIserver.GET_NEW_OFFERS();

            if(!newOffers.length){
                return await bot.sendMessage(telegramId, 'Необработанных заявок нет ✊');
            }
            
            for(let offer of newOffers){
                const control = Buttons([[
                    { text: '✅ Принять', callback_data: `AcceptOffer=${offer.offer_id}` },
                    { text: '❌ Отклонить', callback_data: `RejectOffer=${offer.offer_id}` },
                ]]);

                //получение пользователя
                const currentUser = await APIserver.FIND_USER(offer.user_id);

                //сообщение с заявками
                const messageInfo = `Заявка от @${currentUser.nickname} на "${offer.sub_id}"/n
                К оплате: ${offer.payment} ₽/n
                Создана: ${new Time(offer.created_date).toFriendlyString()}`.format();

                await bot.sendMessage(telegramId, messageInfo, control)
            }

            return
        }

        //подтверждение оплаты 
        if(query.data === 'confirm payment' && state.offerData){

            //сброс опций по умолчанию
            state.default();

            // поздравление с новой заявкой
            await bot.sendMessage(telegramId, `<b>✔️ Заявка отправлена</b>/n/n
                Тип подписки — ${state.offerData.subname}/n
                Цена — ${state.offerData.price} ₽/n
                К оплате с учетом скидки — ${state.offerData.toPay} ₽/n
                Использованный промокод — ${state.offerData.promoName}/n
                Скидка по оплате — ${state.offerData.discount}%/n/n
                <b>🧩 Заявка в очереди</b>/n/n
                Также статус заявки можно проверить в опции <b>"Моя подписка"</b>/n
                Отменить заявку можно там же.
            `.format(), state.options);

            //ограничение по заказу 1 раз в сутки
            state._callTimeoutLimit(64800000, 'new offer');
            
            return
        }

        //отмена заявки
        if(query.data === 'cancel offer' && state.offerData){
            await APIserver.REJECT_OFFER(state.offerData.offerId);
            delete state.offerData;
            state.default();
            bot.sendMessage(telegramId, 'Вы на главной странице своего аккаунта ℹ️', state.options);
            return
        }

        //обработка на главную в случае отмены оплаты
        if(query.data === 'main menu' && state.telegram){
            state.default();
            bot.sendMessage(telegramId, 'Вы на главной странице своего аккаунта ℹ️', state.options);
            return
        }

        //контакты администратора
        if(query.data === 'admin info' && state.telegram){
            bot.sendMessage(telegramId, config.admin_contacts, state.options);
            return
        }

        //плохо работает VPN
        if(query.data === 'help vpn' && state.telegram){
            const message = `
                <b>Первым делом убедитесь, что у вас актульная подписка</b>/n
                Перейдите в <u>"Моя подписка"</u>, — <u>Статус</u> — <u>Подписка действует</u>. 
                Если подспика истекла — оформите новую, чтобы решить проблему с подключением./n/n
                <b>Если подспика актуальная</b>/n
                Проблема может быть в том, что вы не импортировали новую подспику, после того, как старая закончилась, 
                удалите старую подписку в своем приложении (например в v2rayN), скопируйте строку подключения из телеграм бота в "Моя подспика" 
                и импортируйте скопированную подписку. В видео-инструкциях по подключению в опции <u>"Как подключиться"</u> в конце показано как удалять и импортировать подспики 
                на тех или иных устройствах./n/n
                <b>Если все ровно не работает</b>/n
                Если вы используйтеет Windows и у вас просто пропадает значок интернета, это не значит, что 
                пропадает сам интернет, это связано с перехватом сетевого интерфейса. Откройте браузер и убедитесь, что VPN работает исправно. В противном 
                слуаче придпримите следующие действия последовательно, и проверяйте, заработает ли ваш VPN:/n
                1. Отключитесь и подключитесь к VPN повторно./n
                2. Перезагрузите ваше устройство раздачи (телефон, вайфай) и подключитесь к VPN повторно./n
                3. Обновите QR-код подключения. Обновление QR кода подключения вызывает полный сброс подписки, включая строку и 
                QR код подключения. После того, как нажмете на <u>"Обновить QR-код подключения"</u>, удалите старую подписку из приложения, которое используете для подключения, 
                например v2rayN, и добавьте новую строку подключения, которая будет в опции <u>"Моя подписка"</u>. Проверьте работу VPN./n
                4. Если ничего из выше предложенного не помогло, напишите <a href='https://t.me/Albert_zero2'>администратору</a>./n/n
                Как показывает практика, на втором, максимум на третьем пункте, проблема исправляется ✔️/n/n
                Скорость и вашу локацию удобно проверять на speedtest.net и 2ip.ru, так 2ip.ru должен показывать "Нидерланды", на speedtest.net можно замерить скорость вашего интернет соединения, в том числе и с VPN.

            `.format();

            bot.sendMessage(telegramId, message, state.options);
            return
        }

        //инструкция по подключению
        if(query.data.indexOf('device_instruction') + 1){
            const {devices} = instructionOptions();
            const selectedDevice = query.data.split('=')[1];
            const device = devices.find(device => device.name === selectedDevice);

            bot.sendMessage(telegramId, `
                Смотрите видео, как подключить <a href='${device.videoUrl}'>${device.videoUrl ? device.name : '(видео скоро будет)'} 👇</a>/n/n
                ✍️ Или прочтите <a href='${device.instruction}'>текстовую инструкцию</a>
            `.format(), state.options);

            return;
        }

        //выбор устройств для подключения
        if(query.data === 'instruction' && state.telegram){
            const {devices, options} = instructionOptions();
            bot.sendMessage(telegramId, 'Какое у вас устройство ? 👇', options);
            return;
        }

        //обновление qrcode подключения
        if(query.data === 'update qrcode' && state.telegram){

            //проверка таймаутра статистики
            if(!state._timeoutIsEnd('offer info')){
                bot.sendMessage(telegramId, 'Нельзя обновить QR-код до окончания ограничения по просмотру опции "Моя подписка" 🔙', state.options);
                return
            }

            //проверка таймаутра обновления QR-кода
            if(!state._timeoutIsEnd('update qrcode')){
                bot.sendMessage(telegramId, 'Обновить QR-код можно будет через 6 часов с начала последнего обновления 🔙', state.options);
                return
            } 

            await APIserver.UPDATE_QRCODE(telegramId);

            //ограничение по обновлению QR-кода 1 раз в 6 часов
            state._callTimeoutLimit(21600000 , 'update qrcode');
            bot.sendMessage(telegramId, 'QR-код обновлен 🔄️\nВыберите опцию "Моя подписка", чтобы просмотреть.', state.options);
            return
        }

        //информация по заявке
        if(query.data === 'offer info' && state.telegram){

            //проверка таймаутра статистики
            if(!state._timeoutIsEnd('offer info')){
                bot.sendMessage(telegramId, 'Просмотреть информацию по подписке можно будет через 5 минут с начала последнего просмотра 🔙', state.options);
                return
            }

            console.log(123);

            //получение информации о заявке
            const offerInfo = await APIserver.GET_OFFER_INFO(telegramId);

            //ограничение по просмотру статистики 1 раз в 30 минут
            state._callTimeoutLimit(300000, 'offer info', 3);

            //проверка на строку подключения
            if(!offerInfo.connString){
                return bot.sendMessage(telegramId, `<b>🧩 Ваша заявка в очереди</b>/n/n
                    Наименование — ${offerInfo.subName}/n
                    Трафик — ${!offerInfo.subDataGBLimit  ? 'ထ' : offerInfo.subDataGBLimit} ГБ / Мес/n
                    Срок — ${TextDayFormat(offerInfo.subDateLimit / 86400)}/n/n
                    <b>ℹ️ Вы также получите уведомление после обработки заявки </b>
                `.format(), Buttons([[{ text: 'Отменить заявку ❌', callback_data: `RejectOffer=${offerInfo.offerId}`}],[{
                    text: 'На главную 🔙', callback_data: 'main menu'
                }]]));
            }

            console.log(offerInfo);

            // Генерация QR-кода
            const qrCodeBuffer = await QRCode.toBuffer(offerInfo.connString, { type: 'png' });

            console.log('after');

            //конфигурация сервера
            // const apiServerConfig = await APIserver.GET_CONF();

            //отправка сообщения с данными
            await bot.sendPhoto(telegramId, qrCodeBuffer, { caption: `QR-код для подключения по вашей подписке./n/n
            <b>Или скопируйте строку подключения для импорта 👇</b>/n
            <pre><code>${offerInfo.connString}</code></pre>/n/n
            🌐 Статус: ${offerInfo.isExpired ? 'Подписка истекла ❌' : 'Подписка действует ✔️'}/n/n
            💻 Вы можете подключить не больше 2 устройств/n/n
            ℹ️ Название подписки: ${offerInfo.subName}/n/n
            📶 Трафик: ${!offerInfo.dataLimit  ? 'ထ' : FormatBytes(offerInfo.dataLimit / 1024 ** 3)} ГБ/n/n
            ${(offerInfo.limitDiffrence ? '➗ Трафик перерасчитан с учетом обновления QR-кода/n/n' : '')}
            ℹ️ Использовано: ${FormatBytes(offerInfo.usedTraffic)}/n/n
            📅 Дата окончания: ${new Time(offerInfo.subDateLimit).toFriendlyString()}/n/n
            ℹ️ Создан: ${new Time(offerInfo.createdDate).toFriendlyString()}`.format(),
            ...state.options});

            // /n/n
            // ${
            //     offerInfo.price === 0 ? '<b>При оформлении платной подписки вам доступна реферальня ссылка.</b> ' :
            //     `<b>Пригласите друга по этой реферальной ссылке 👇</b>/n
            //     <pre><code>https://t.me/KrakenVPNbot?start=${offerInfo.inviteCode}</code></pre>/n/n
            //     👥 Приглашено пользователей: ${offerInfo.userInviteCount}/n/n
            //     ℹ️ Скидка на следующий месяц: ${offerInfo.nextPayDiscount}%/n/n
            //     `
            // }
            // За каждого приглашенного друга, вы получаете скидку <b>${apiServerConfig.invite_discount}%</b> на следующую оплату, друг — <b>${apiServerConfig.for_invited_discount}%</b>./n/n
            // За двух приглашенных друзей вы получаете <b><u>бесплатный месяц на любой тариф</u></b> 🎁


            return
        }

        //если пользователь отказался от промокода
        if(query.data === 'no promocode' && state.telegram){
            state.action = "";
            return await createNewoffer(state);
        }

        //помощь в выборе подписки
        if(query.data === 'help subscribe' && state.telegram){
            const offerData = await APIserver.GET_OFFER_INFO(telegramId);
            const timeNow = new Time().shortUnix();
            const dateDiff = (timeNow < offerData.subDateLimit ? timeNow : offerData.subDateLimit) - offerData.createdDate;
            const truthTraffic = (offerData.subDataGBLimit * 1024 ** 3 - offerData.dataLimit) + offerData.usedTraffic;
            const traficPerTime = truthTraffic/dateDiff;
            const estimateTrafic = traficPerTime * 2592000;
            const propareSubs =  state.subData.map(item => item.data_limit === 0 ? {...item, data_limit: Infinity} : {...item, data_limit: item.data_limit * 1024 ** 3});
            const recomendSub = propareSubs.filter(item => item.data_limit > estimateTrafic && item.name_id !== 'free').sort((a, b) => a.data_limit - b.data_limit)[0];
            const message = `
                ℹ️ Исходя из использованного вами трафика за ${TextDayFormat(Math.ceil(dateDiff/86400)).toLowerCase()} 
                при среднем расходе ${FormatBytes(traficPerTime * 24 * 3600)} за 1 день, ваш расход в месяц составит 
                приблизительно ${FormatBytes(estimateTrafic)}/n/n
                ✔️ <b>Для комфортного использования VPN рекомендуем вам подписку "${recomendSub.title}" 
                с трафиком ${recomendSub.data_limit === Infinity ? 'ထ' : recomendSub.data_limit / 1024 ** 3} ГБ  
                на срок ${TextDayFormat(recomendSub.date_limit/86400)}</b>
            `.format();

            return await bot.sendMessage(telegramId, message, state.options);
        }

        //обработка выбранной подписки
        if(query.data.includes('sub=') && state.telegram){

            //проверка возможности использования промокода
            const currentSub = state.subData.find(item => item.name_id === query.data.replace('sub=', ''));

            //получение название подписки
            state.data = {
                'sub_id': query.data.replace('sub=', ''),
                'user_id': telegramId
            }

            //ограничим доступ к промокодам первым платным заказом
            const notFreeOffer = await APIserver.FIND_NOT_FREE_OFFER(state.telegramId);

            //если текущая подписка не поддерживает промокод
            if(!currentSub.with_promo || notFreeOffer){

                if(!currentSub.with_promo){
                    bot.sendMessage(telegramId, 'Эта подписка не поддерживает промокоды ℹ️');
                }
                else{
                    bot.sendMessage(telegramId, `Промокод доступен только при первой оплате ℹ️/n/n
                    Чтобы получить больше скидок, пригласите друга по своему личному промокоду. 
                    За каждого приглашенного друга, вы получаете скидку 25% на следующую оплату.
                    `.format());
                }
               
                return await createNewoffer(state);
            }
            //если промокод поддерживается
            else{

                //получение промокода
                state.action = 'awaiting promocode';

                //отказ от промокода
                state.options = Buttons(
                    [[{text: 'Продолжить без промокода ❓', callback_data: 'no promocode'}]]
                );

                //ввод промокода
                bot.sendMessage(telegramId, `Хотите больше сэкономить ?/n/n
                    Введите промокод, чтобы получить скидку на оплату ℹ️
                `.format(), state.options);
                return
            }
        }

        //если новый заказ
        if(query.data === 'new offer' && state.telegram){

            //проверка таймаутра не новую заявку
            if(!state._timeoutIsEnd('new offer')){
                bot.sendMessage(telegramId, 'Оформлять новый заказ можно не более одного раза в сутки с начала последней заявки 🔙', state.options);
                return
            }

            //получение имеющиъся подписок
            const allSubs = await APIserver.GET_SUBS(telegramId);
            const sortedByPriceSubs = allSubs.sort((a, b) => b.price - a.price);
            state.subData = sortedByPriceSubs;

            //установка имеющихся подписок
            state.options = Buttons([...state.subData.map(sub => ([
                {
                    text: `
                        ${sub.title} | 
                        ${TextDayFormat(sub.date_limit / 86400)} | 
                        ${sub.data_limit === 0 ? 'ထ' : sub.data_limit} Гб / Мес | 
                        ${sub.price} ₽ / Мес ${sub.discount ? `| ${sub.discount}% 🎁` : ''}/n
                    `.format(),
                    callback_data: `sub=${sub.name_id}`
                }])), [{
                    text: 'Какую подписку мне выбрать ❓',
                    callback_data: 'help subscribe'
            }],[{
                text: 'Вернуться на главную 🔙',
                callback_data: 'main menu'
        }]]);

            //более развернутое сообщение о подписках
            bot.sendMessage(telegramId, `
                <b>Выберите подписку, или воспользуйтесь опцией "Какую подписку мне выбрать" 👇</b>
            `.format(), state.options);
            return
        }
    }
    catch(err){

        //сброс сосотояния
        if(state) state.default();

        WriteInLogFile(err);

        //обработка ошибок axios
        if(err.response && typeof err.response.data === 'string'){
            const errorStatusMess = `${err.response.status} ${err.response.statusText}`;
            bot.sendMessage(telegramId, err.response.data || errorStatusMess);
            return;
        }

        bot.sendMessage(telegramId, config.default_error_message);
    }
});

//создание опций инструкции
function instructionOptions(){
    const devices = [
        {
            name: 'Android',
            videoUrl: 'https://t.me/vpnnnn12345/4?single',
            instruction: 'https://docs.google.com/document/d/17c6bFx-AWRTZ_2HjutzQYSUGllZ6xIAb/edit#heading=h.30j0zll'
        },
        {
            name: 'iPhone IOS',
            videoUrl: 'https://t.me/vpnnnn12345/3?single',
            instruction: 'https://docs.google.com/document/d/17c6bFx-AWRTZ_2HjutzQYSUGllZ6xIAb/edit#heading=h.1fob9te'
        },
        {
            name: 'Windows',
            videoUrl: 'https://t.me/vpnnnn12345/2?single',
            instruction: 'https://docs.google.com/document/d/17c6bFx-AWRTZ_2HjutzQYSUGllZ6xIAb/edit#heading=h.gjdgxs'
        },
        {
            name: 'Linux',
            videoUrl: null,
            instruction: 'https://docs.google.com/document/d/17c6bFx-AWRTZ_2HjutzQYSUGllZ6xIAb/edit#heading=h.gjdgxs'
        }
    ];

    //определение кнопок
    const line_keybrd = devices.map(device => {
        return ([{
            text: device.name,
            callback_data: `device_instruction=${device.name}`
        }])
    })

    //добавление выхода
    line_keybrd.push([{
        text : 'Вернуться на главную 🔙',
        callback_data: 'main menu'
    }])

    //список опций для просмотра
    const options = Buttons(line_keybrd)

    return {options, devices};
}

//главное меню пользователя
function mainMenuOptions(telegramId){

    const mainButtons = [
        [{ text: 'Моя подписка 📶', callback_data: 'offer info' }],
        [{ text: 'Обновить QR-код подключения 🔄️', callback_data: 'update qrcode' }],
        [{ text: 'Новая заявка 🆕', callback_data: 'new offer' }],
        [{ text: 'Как подключиться ℹ️', callback_data: 'instruction' }],
        [{ text: 'Контакты администратора 👤', callback_data: 'admin info' }],
        [{ text: 'Плохо работает VPN ? 🆘', callback_data: 'help vpn' }]
    ]

    if(telegramId === ADMIN_TELEGRAN_ID){
        mainButtons.push([{text: "Заявки на подключение 🆕", callback_data: 'pending offers'}]);
    }

    //тут обработка зарегестрированного пользователя
    const options = Buttons(mainButtons);

    return options
}

//создание новой заявкиэ
async function createNewoffer(state, onlyConnection){

    //получение id пользователя
    const telegramId = state.telegramId;

    try{

        //попытка отправки заявки с веденным промокодом
        state.offerData = await APIserver.CREATE_OFFER(state.data);

        //если оформление заказа вернуло код подключения сразу
        if(state.offerData.connection){

            //возвращаться только строку подключение
            if(onlyConnection) return state.offerData.connection;

            //сброс опций
            state.default();

            // Генерация QR-кода
            const qrCodeBuffer = await QRCode.toBuffer(state.offerData.connection, { type: 'png' });

            // Получение информации по подписке
            const offerInfo = await APIserver.GET_OFFER_INFO(telegramId);

            //конфигурация сервера
            const apiServerConfig = await APIserver.GET_CONF();

            //отправка сообщения с данными
            await bot.sendPhoto(telegramId, qrCodeBuffer, { caption: `QR-код для подключения по вашей подписке./n/n
                <b>Или скопируйте строку подключения для импорта 👇</b>/n
                <pre><code>${state.offerData.connection}</code></pre>/n/n
                🌐 Статус: ${offerInfo.isExpired ? 'Подписка истекла ❌' : 'Подписка действует ✔️'}/n/n
                💻 Вы можете подключить не больше 2 устройств/n/n
                ℹ️ Название подписки: ${offerInfo.subName}/n/n
                📶 Трафик: ${!offerInfo.dataLimit  ? 'ထ' : FormatBytes(offerInfo.dataLimit / 1024 ** 3)} ГБ/n/n
                ${(offerInfo.limitDiffrence ? '➗ Трафик перерасчитан с учетом обновления QR-кода/n/n' : '')}
                ℹ️ Использовано: ${FormatBytes(offerInfo.usedTraffic)}/n/n
                📅 Дата окончания: ${new Time(offerInfo.subDateLimit).toFriendlyString()}/n/n
                ℹ️ Создан: ${new Time(offerInfo.createdDate).toFriendlyString()}/n/n
            `.format(), ...state.options});

            // <b>🔥 При приобритении платной подписки вам доступна реферальная ссылка</b>/n/n
            // За каждого приглашенного друга этой ссылке, вы получаете скидку <b>${apiServerConfig.invite_discount}%</b> на следующую оплату, друг — <b>${apiServerConfig.for_invited_discount}%</b>/n/n
            // За двух приглашенных друзей — <b><u>бесплатный месяц на любой тариф 🎁</u></b>

            // //ограничение по просмотру статистики 1 раз в 30 минут
            // state._callTimeoutLimit(300000, 'offer info', 3);

            return
        }

        // чтение файла картинки оплаты
        const imgPath = path.join(__dirname, 'payments', 'payqrcode.png');
        const imgBuffer = await fs.readFile(imgPath);

        //пустые кнопки для подтверждения
        state.options = Buttons([
            [{ text: 'Готово 👌', callback_data: 'confirm payment' }],
            [{ text: 'Отменить заявку ❌', callback_data: 'cancel offer' }],
        ]);

        // отправка изображения с текстом
        await bot.sendPhoto(telegramId, imgBuffer, {
            caption: `<b>К оплате: ${state.offerData.toPay} ₽</b>/n
            Скидка по промокоду ${state.offerData.promoName} — ${state.offerData.discount}% ℹ️/n/n
            Сканируйте QR-код для оплаты, если используете приложение Сбербанк/n/n
            Или воспользуйтесь безкомпромиссной оплатой по СПБ на номер: <b>+7 922 406 56 25. Получатель Альберт К.</b>/n/n
            Чек можно прислать сюда: wildcat2k21@gmail.com
            `.format(), ...state.options
        });
    }
    //обрабатывает только ошибку использования пробной подписки
    catch(err){

        //проверка на ошибку переоформления пробной подписки
        if(err.response && typeof err.response.data === 'string' && err.response.data.startsWith('Пробная подписка')){
            if(state) state.default();
            bot.sendMessage(telegramId, 'Пробная подписка доступна только на первый заказ ℹ️', state.options);
            return
        }

        throw err;
    }
}