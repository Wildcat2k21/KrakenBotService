require('dotenv').config();
const axios = require('axios');

//основная настройка
const API_SERVER = process.env.API_SERVER;

//класс для взаимодействия с API сервером
class APIserver {

    static serverURL = API_SERVER;

    static async ACCEPT_OFFER(offer_id){
        const response = await axios.patch(`${APIserver.serverURL}/confirm`, {offer_id, status: 'accepted'});
        
        return response.data;
    }

    static async REJECT_OFFER(offer_id){
        const response = await axios.patch(`${APIserver.serverURL}/confirm`, {offer_id, status: 'rejected'});
        
        return response.data;
    }

    static async FIND_USER_WITH_INVITE(invite){
        const response = await axios.get(`${APIserver.serverURL}/data`, {
            params: {
            tableName : 'user',
            condition: [[{
                field: 'invite_code',
                exacly: invite
            }]], limit: 1}
        });
        
        return response.data[0]
    }

    //поиск пользователя
    static async FIND_USER(telegram_id) {
        const response = await axios.get(`${APIserver.serverURL}/data`, {
            params: {
            tableName : 'user',
            condition: [[{
                field: 'telegram_id',
                exacly: telegram_id
            }]], limit: 1}
        });
        
        return response.data[0]
    }

    //поиск не бесплатного заказа
    static async FIND_NOT_FREE_OFFER(telegram_id) {
        const response = await axios.get(`${APIserver.serverURL}/data`, {
            params: {
            tableName : 'offer',
            condition: [[{
                field: 'user_id',
                exacly: telegram_id
            },{
                field: 'promo_id',
                nonEqual: 'default'
            }]], limit: 1}
        });
        
        return response.data[0]
    }

    //создание нового заказа
    static async CREATE_OFFER(offerData){
        const response = await axios.post(`${APIserver.serverURL}/offer`, offerData);

        return response.data;
    }

    //регистраиця пользователя
    static async NEW_USER(userdata){
        const response = await axios.post(`${APIserver.serverURL}/user`, userdata);

        return response.data;
    }

    //обновление qrcode подписки
    static async UPDATE_QRCODE(telegram_id){
        const response = await axios.patch(`${APIserver.serverURL}/recreate`, {users: [telegram_id]});

        return response.data;
    }

    //получение информации о заказе
    static async GET_OFFER_INFO(telegram_id){
        const response = await axios.get(`${APIserver.serverURL}/offer`, {
            params: {telegram_id}
        });

        console.log(response.data);
        return response.data;
    }

    //получение подписок
    static async GET_SUBS(telegram_id){
        const response = await axios.get(`${APIserver.serverURL}/data`, {
            params: {tableName : 'sub', telegram_id}
        });
        
        return response.data;
    }

    //получение заказов
    static async GET_NEW_OFFERS(){
        const response = await axios.get(`${APIserver.serverURL}/data`, {
            params: {tableName : 'offer', condition: [[{
                field: 'conn_string',
                isNull: true
            }]]}
        });
        
        return response.data;
    }

    //получение конфигурации сервера
    static async GET_CONF(){
        const response = await axios.get(`${APIserver.serverURL}/config`);

        return response.data;
    }
}

module.exports = APIserver