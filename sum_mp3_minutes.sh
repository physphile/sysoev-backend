#!/usr/bin/env bash

echo "Проверка наличия ffprobe..."
if ! command -v ffprobe >/dev/null 2>&1; then
    echo "❌ ffprobe не найден. Установи ffmpeg."
    exit 1
else
    echo "✔ ffprobe найден"
fi

echo
echo "Ищу mp3-файлы (включая .MP3)..."
mapfile -d '' FILES < <(find . -type f \( -iname "*.mp3" \) -print0)

if [[ ${#FILES[@]} -eq 0 ]]; then
    echo "❌ mp3-файлы не найдены"
    exit 1
else
    echo "✔ Найдено файлов: ${#FILES[@]}"
    echo
fi

total=0

for file in "${FILES[@]}"; do
    echo "Обрабатываю: $file"
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$file")

    if [[ -z "$dur" ]]; then
        echo "⚠ Не удалось получить длительность: $file"
        continue
    fi

    total=$(echo "$total + $dur" | bc)
done

echo "---------------------------------------"
echo "Готово!"
echo "Суммарная длительность (минуты): $(echo "$total/60" | bc -l)"
