<?php
// Ecohub — api/keyword_parser.php
// Parser determinista de palabras clave y fechas en lenguaje natural para la agenda.
// Funciona 100% de manera autónoma sin dependencias de LLM ni librerías externas.

declare(strict_types=1);

class KeywordParser {
    /**
     * Mapeo de meses en español a su número correspondiente (01 - 12).
     */
    private const MESES = [
        'enero' => '01',
        'febrero' => '02',
        'marzo' => '03',
        'abril' => '04',
        'mayo' => '05',
        'junio' => '06',
        'julio' => '07',
        'agosto' => '08',
        'septiembre' => '09',
        'setiembre' => '09',
        'octubre' => '10',
        'noviembre' => '11',
        'diciembre' => '12'
    ];

    /**
     * Días de la semana en inglés para strtotime().
     */
    private const DIAS = [
        'lunes' => 'monday',
        'martes' => 'tuesday',
        'miercoles' => 'wednesday',
        'miércoles' => 'wednesday',
        'jueves' => 'thursday',
        'viernes' => 'friday',
        'sabado' => 'saturday',
        'sábado' => 'saturday',
        'domingo' => 'sunday'
    ];

    /**
     * Verbos de acción soportados (patrón regex).
     */
    private const VERBOS_REGEX = '/\b(crear|crea|enviar|envia|envía|revisar|revisa|agendar|agenda|confirmar|confirma|pagar|paga|reunir|reune|reúne)\b/iu';

    /**
     * Parsea un texto en lenguaje natural y extrae la fecha, la tarea y el texto original.
     *
     * @param string $text Texto ingresado por el usuario
     * @param DateTimeImmutable|null $refDate Fecha de referencia (por defecto: hoy)
     * @return array{fecha: string, tarea: string, texto_original: string}|null
     */
    public static function parse(string $text, ?DateTimeImmutable $refDate = null): ?array {
        $raw = trim($text);
        if ($raw === '') return null;

        $ref = $refDate ?? new DateTimeImmutable('today');

        // 1. Validar presencia de verbo de acción
        if (!preg_match(self::VERBOS_REGEX, $raw, $verbMatch, PREG_OFFSET_CAPTURE)) {
            return null;
        }

        // 2. Extraer fecha
        $dateInfo = self::extractDate($raw, $ref);
        if ($dateInfo === null) {
            return null;
        }

        $isoDate = $dateInfo['date'];
        $dateMatchText = $dateInfo['matched_text'];

        // 3. Extraer y limpiar descripción de la tarea
        // Buscar el segmento a partir del verbo de acción
        $verbOffset = $verbMatch[0][1];
        $fromVerb = substr($raw, $verbOffset);

        // Remover conectores temporales y el fragmento de fecha de la descripción
        $cleanTask = preg_replace('/\b(para\s+el|el\s+próximo|el\s+proximo|el|antes\s+del|antes\s+de|hasta\s+el)\s+' . preg_quote($dateMatchText, '/') . '\b/iu', '', $fromVerb);
        $cleanTask = str_ireplace($dateMatchText, '', $cleanTask ?? $fromVerb);

        // Limpiar puntuaciones y espacios sobrantes
        $cleanTask = trim(preg_replace('/\s+/', ' ', (string)$cleanTask), " \t\n\r\0\x0B,.-:;");
        if ($cleanTask === '') {
            $cleanTask = $raw;
        }

        return [
            'fecha' => $isoDate,
            'tarea' => $cleanTask,
            'texto_original' => $raw
        ];
    }

    /**
     * Detecta y normaliza patrones de fecha a formato ISO8601 (YYYY-MM-DD).
     */
    private static function extractDate(string $text, DateTimeImmutable $ref): ?array {
        $year = $ref->format('Y');

        // A. Relativos: pasado mañana, mañana, hoy
        if (preg_match('/\bpasado\s+mañana\b/iu', $text, $m)) {
            return [
                'date' => $ref->modify('+2 days')->format('Y-m-d'),
                'matched_text' => $m[0]
            ];
        }
        if (preg_match('/\bmañana\b/iu', $text, $m)) {
            return [
                'date' => $ref->modify('+1 day')->format('Y-m-d'),
                'matched_text' => $m[0]
            ];
        }
        if (preg_match('/\bhoy\b/iu', $text, $m)) {
            return [
                'date' => $ref->format('Y-m-d'),
                'matched_text' => $m[0]
            ];
        }

        // B. Relativos con días de la semana: "próximo lunes", "este viernes", "el próximo martes"
        if (preg_match('/\b(?:el\s+)?(?:próximo|proximo|este)\s+(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/iu', $text, $m)) {
            $dayName = strtr(strtolower($m[1]), ['á'=>'a', 'é'=>'e', 'í'=>'i', 'ó'=>'o', 'ú'=>'u']);
            $enDay = self::DIAS[$dayName] ?? null;
            if ($enDay) {
                // Siguiente ocurrencia del día
                $dt = $ref->modify("next {$enDay}");
                return [
                    'date' => $dt->format('Y-m-d'),
                    'matched_text' => $m[0]
                ];
            }
        }

        // C. Formato numérico: DD/MM o DD/MM/YYYY (ej: 08/08, 15/09, 25/12/2026)
        if (preg_match('/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/u', $text, $m)) {
            $d = str_pad($m[1], 2, '0', STR_PAD_LEFT);
            $mo = str_pad($m[2], 2, '0', STR_PAD_LEFT);
            $y = !empty($m[3]) ? (strlen($m[3]) === 2 ? '20' . $m[3] : $m[3]) : $year;

            if (checkdate((int)$mo, (int)$d, (int)$y)) {
                return [
                    'date' => sprintf('%04d-%02d-%02d', (int)$y, (int)$mo, (int)$d),
                    'matched_text' => $m[0]
                ];
            }
        }

        // D. Formato "Día de Mes" (ej: "8 de agosto", "20 de octubre", "15 de septiembre de 2026")
        $mesesPattern = implode('|', array_keys(self::MESES));
        if (preg_match('/\b(\d{1,2})\s+de\s+(' . $mesesPattern . ')(?:\s+(?:de\s+)?(\d{4}))?\b/iu', $text, $m)) {
            $d = str_pad($m[1], 2, '0', STR_PAD_LEFT);
            $mo = self::MESES[strtolower($m[2])];
            $y = !empty($m[3]) ? $m[3] : $year;

            if (checkdate((int)$mo, (int)$d, (int)$y)) {
                return [
                    'date' => sprintf('%04d-%02d-%02d', (int)$y, (int)$mo, (int)$d),
                    'matched_text' => $m[0]
                ];
            }
        }

        // E. Formato "Mes Día" (ej: "agosto 8", "octubre 20")
        if (preg_match('/\b(' . $mesesPattern . ')\s+(\d{1,2})(?:\s+(?:de\s+)?(\d{4}))?\b/iu', $text, $m)) {
            $mo = self::MESES[strtolower($m[1])];
            $d = str_pad($m[2], 2, '0', STR_PAD_LEFT);
            $y = !empty($m[3]) ? $m[3] : $year;

            if (checkdate((int)$mo, (int)$d, (int)$y)) {
                return [
                    'date' => sprintf('%04d-%02d-%02d', (int)$y, (int)$mo, (int)$d),
                    'matched_text' => $m[0]
                ];
            }
        }

        return null;
    }
}
