class Time {
    constructor(input) {
        // Если передана строка формата "чч.мм.гггг чч:мм:сс"
        if (typeof input === 'string') {
            const parsedDate = this.parseDateString(input);
            if (!parsedDate) {
                throw new Error(`Некорректная строка даты: '${input}'. Формат должен быть "чч.мм.гггг чч:мм[:сс]"`);
            }
            this.date = parsedDate;
        }
        // Если передано Unix-время в секундах
        else if (typeof input === 'number' && !isNaN(input)) {
            this.date = new Date(input * 1000); // Преобразуем секунды в миллисекунды
        }
        // Если ничего не передано, используем текущее время
        else if (input === undefined) {
            this.date = new Date();
        } else {
            throw new Error(`Некорректное время: '${input}'. Укажите Unix-время в секундах или строку "чч.мм.гггг чч:мм[:сс]"`);
        }
    }

    // Метод для возврата даты в формате "чч.мм.гггг чч:мм:сс"
    toFormattedString(withSeconds = true) {
        const addZero = (num) => (num < 10 ? '0' + num : num); // Добавляем ведущий ноль, если нужно
        const day = addZero(this.date.getDate());
        const month = addZero(this.date.getMonth() + 1); // Месяцы в JS начинаются с 0
        const year = this.date.getFullYear();
        const hours = addZero(this.date.getHours());
        const minutes = addZero(this.date.getMinutes());
        const seconds = addZero(this.date.getSeconds());

        return withSeconds ? `${day}.${month}.${year} ${hours}:${minutes}:${seconds}` : 
        `${day}.${month}.${year} ${hours}:${minutes}`;
    }

    // Новый метод для возврата даты в формате "дд Месяц гггг чч:мм:сс"
    toFriendlyString() {
        const monthNames = [
            'Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня',
            'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'
        ];
        const addZero = (num) => (num < 10 ? '0' + num : num); // Добавляем ведущий ноль, если нужно
        const day = addZero(this.date.getDate());
        const month = monthNames[this.date.getMonth()]; // Получаем название месяца
        const year = this.date.getFullYear();
        const hours = addZero(this.date.getHours());
        const minutes = addZero(this.date.getMinutes());

        return `${day} ${month} ${year} ${hours}:${minutes}`;
    }

    // Новый метод для проверки валидности строки или Unix-времени
    static isValid(input) {
        // Проверка на валидность Unix-времени (число в секундах)
        if (typeof input === 'number' && !isNaN(input) && input > 0) {
            return true;
        }

        // Проверка на валидность строки формата "чч.мм.гггг чч:мм[:сс]"
        if (typeof input === 'string') {
            const dateTimeRegex = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/;
            return dateTimeRegex.test(input);
        }

        // Если ни одно из условий не выполнилось, возвращаем false
        return false;
    }

    // Метод для парсинга строки "чч.мм.гггг чч:мм[:сс]"
    parseDateString(dateString) {
        const dateTimeRegex = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/;
        const match = dateString.match(dateTimeRegex);

        if (match) {
            const [, day, month, year, hours, minutes, seconds] = match;
            return new Date(
                `${year}-${month}-${day}T${hours}:${minutes}:${seconds || '00'}` // Секунды по умолчанию '00'
            );
        }

        return null;
    }

    // Возвращает Unix-время в секундах
    shortUnix() {
        return Math.floor(this.date.getTime() / 1000); // Переводим миллисекунды в секунды
    }

    // Метод для прибавления времени в секундах и возврата нового экземпляра Time
    addTime(seconds) {
        const newUnixTime = this.shortUnix() + seconds; // Прибавляем секунды к текущему Unix-времени
        return new Time(newUnixTime); // Возвращаем новый экземпляр Time с обновленным временем
    }
}

module.exports = Time;
