// Функция для проверка полей конфигурации
function checkConfigFields(data){
    const requedFields = {
        'abaout_service': {
            type: 'string'
        },
        'private_policy': {
            type: 'string',
        },
        'user_policy' : {
            type: 'string'
        },
        'service_instruction' : {
            type: 'string'
        },
        "admin_contacts": {
            type: 'string'
        },
        "default_error_message" : {
            type: 'string'
        }
    }

    // Проверяем типы полей
    checkMiddleFunction(requedFields, data);
}

function checkMiddleFunction(requedFields, data){

    // Проверяем наличие обязательных полей
    const keys = Object.keys(requedFields);

    // Проверяем тип и ограничение полей
    for(let i = 0; i < keys.length; i++){

        const options = requedFields[keys[i]];
        const currentDataValue = data[keys[i]];

        // Присвоение имени полю, если оно не передано
        options.name = options.name || keys[i];
        if(!(keys[i] in data)){
            const textInputError = new Error(`Поле '${options.name}' не передано`);
            textInputError.dataCheck = true;
            throw textInputError;
        };

        // Проверка типа полей, предпологается что тип по умолчанию string
        if((options.type || 'string') !== typeof currentDataValue) {
            const textInputError = new Error(`Поле '${options.name}' имеет неверный формат`);
            textInputError.dataCheck = true;
            throw textInputError;
        }
    
        // Проверка на максимульную длину поля
        if('max_length' in options){
            if(currentDataValue.length > options.max_length){
                const textInputError = new Error(`Поле ${options.name} слишком длинное`);
                textInputError.dataCheck = true;
                throw textInputError;
            }
        }

        // Проверка на соответствие длины поля
        if('length' in options){
            if(currentDataValue.length !== options.length){
                const textInputError = new Error(`Поле ${options.name} имеет неправильную длину`);
                textInputError.dataCheck = true;
                throw textInputError;
            }
        }
    }
}

module.exports = checkConfigFields;