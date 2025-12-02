#!/bin/bash

# Проверяем, что передан путь к директории
if [ $# -eq 0 ]; then
  echo "Использование: $0 <путь_к_директории>"
  exit 1
fi

DIR_PATH="$1"

# Проверяем, что директория существует
if [ ! -d "$DIR_PATH" ]; then
  echo "Ошибка: Директория '$DIR_PATH' не найдена"
  exit 1
fi

# Проверяем наличие speech_to_text.ts
if [ ! -f "speech_to_text.ts" ]; then
  echo "Ошибка: Файл speech_to_text.ts не найден в текущей директории"
  exit 1
fi

echo "Начинаем обработку WAV-файлов в директории: $DIR_PATH"
echo "----------------------------------------"

# Счетчик обработанных и пропущенных файлов
count=0
skipped=0

# Используем process substitution вместо pipe для сохранения переменных
while IFS= read -r -d '' wav_file; do
  # Получаем директорию, в которой находится файл
  file_dir=$(dirname "$wav_file")

  # Проверяем наличие response.txt в директории файла
  if [ -f "$file_dir/response.txt" ]; then
    echo "⊘ Пропущен (найден response.txt): $wav_file"
    ((skipped++))
  else
    echo "Обработка: $wav_file"

    # Запускаем node с правильным экранированием пути
    node speech_to_text.ts "$wav_file"

    # Проверяем статус выполнения
    if [ $? -eq 0 ]; then
      echo "✓ Успешно обработан: $wav_file"
    else
      echo "✗ Ошибка при обработке: $wav_file"
    fi

    ((count++))
  fi

  echo "----------------------------------------"
done < <(find "$DIR_PATH" -type f \( -iname "*.wav" -o -iname "*.WAV" \) -print0)

echo "Обработка завершена."
echo "Обработано файлов: $count"
echo "Пропущено файлов: $skipped"
