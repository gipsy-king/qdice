module Tables exposing (Map(..), Table, decodeMap, encodeMap)


type alias Table =
    String


type Map
    = Null
    | Melchor
    | Miño
    | Serrano
    | DeLucía
    | Sabicas
    | Planeta
    | Montoya



--tableList : List Table
--tableList =
--    [ Melchor, Miño, DeLucía, Serrano, Avocado ]


decodeMap : String -> Result String Map
decodeMap name =
    case name of
        "Melchor" ->
            Ok Melchor

        "Miño" ->
            Ok Miño

        "Serrano" ->
            Ok Serrano

        "DeLucía" ->
            Ok DeLucía

        "Sabicas" ->
            Ok Sabicas

        "Planeta" ->
            Ok Planeta

        "Montoya" ->
            Ok Montoya

        _ ->
            Err <| "Table (map) not found: " ++ name


encodeMap : Map -> String
encodeMap map =
    case map of
        Null ->
            "Null"

        Melchor ->
            "Melchor"

        Miño ->
            "Miño"

        Serrano ->
            "Serrano"

        Planeta ->
            "Planeta"

        DeLucía ->
            "DeLucía"

        Sabicas ->
            "Sabicas"

        Montoya ->
            "Montoya"
