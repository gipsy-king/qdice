module Backend.HttpCommands exposing (..)

import Http
import Land exposing (Color(..))
import Tables exposing (Table(..), decodeTable)
import Game.Types exposing (Player, PlayerAction(..))
import Backend.Types exposing (..)
import Types exposing (Msg(..))
import Backend.Decoding exposing (..)
import Backend.Encoding exposing (..)
import Backend.MessageCodification exposing (..)
import Snackbar exposing (toastCmd)


loadGlobalSettings : Model -> Cmd Msg
loadGlobalSettings model =
    Http.send (GetGlobalSettings) <|
        Http.get (model.baseUrl ++ "/global") <|
            globalDecoder


authenticate : Model -> String -> Bool -> Cmd Msg
authenticate model code doJoin =
    let
        request =
            Http.post (model.baseUrl ++ "/login")
                (code |> Http.stringBody "text/plain")
            <|
                tokenDecoder
    in
        Http.send (GetToken doJoin) request


loadMe : Model -> Cmd Msg
loadMe model =
    Http.send GetProfile <|
        Http.request
            { method = "GET"
            , headers =
                case model.jwt of
                    Just jwt ->
                        [ Http.header "authorization" ("Bearer " ++ jwt) ]

                    Nothing ->
                        []
            , url = (model.baseUrl ++ "/me")
            , body = Http.emptyBody
            , expect =
                Http.expectJson <| profileDecoder
            , timeout = Nothing
            , withCredentials = False
            }


gameCommand : Model -> Table -> PlayerAction -> Cmd Msg
gameCommand model table playerAction =
    case model.jwt of
        Nothing ->
            toastCmd "Missing JWT"

        Just jwt ->
            Http.send (GameCommandResponse table playerAction) <|
                Http.request
                    { method = "POST"
                    , headers =
                        [ Http.header "authorization" ("Bearer " ++ jwt) ]
                    , url =
                        (model.baseUrl
                            ++ "/tables/"
                            ++ (toString table)
                            ++ "/"
                            ++ (actionToString playerAction)
                        )
                    , body = Http.emptyBody
                    , expect = Http.expectStringResponse (\_ -> Ok ())
                    , timeout = Nothing
                    , withCredentials = False
                    }


enter : Model -> Table -> String -> Cmd Msg
enter model table clientId =
    Http.send (GameCommandResponse table <| Enter) <|
        Http.request
            { method = "POST"
            , headers =
                case model.jwt of
                    Just jwt ->
                        [ Http.header "authorization" ("Bearer " ++ jwt) ]

                    Nothing ->
                        []
            , url =
                (model.baseUrl
                    ++ "/tables/"
                    ++ (toString table)
                    ++ "/Enter"
                )
            , body = Http.stringBody "text/plain" clientId
            , expect = Http.expectStringResponse (\_ -> Ok ())
            , timeout = Nothing
            , withCredentials = False
            }


attack : Model -> Table -> Land.Emoji -> Land.Emoji -> Cmd Msg
attack model table from to =
    case model.jwt of
        Nothing ->
            toastCmd "Missing JWT"

        Just jwt ->
            Http.send (GameCommandResponse table <| Attack from to) <|
                Http.request
                    { method = "POST"
                    , headers = [ Http.header "authorization" ("Bearer " ++ jwt) ]
                    , url =
                        (model.baseUrl
                            ++ "/tables/"
                            ++ (toString table)
                            ++ "/Attack"
                        )
                    , body = Http.jsonBody <| attackEncoder from to
                    , expect = Http.expectStringResponse (\_ -> Ok ())
                    , timeout = Nothing
                    , withCredentials = False
                    }


actionToString : PlayerAction -> String
actionToString action =
    case action of
        Attack a b ->
            "Attack"

        _ ->
            toString action
