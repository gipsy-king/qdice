module Routing exposing (fragmentUrl, goToBestTable, navigateTo, parseLocation, replaceNavigateTo, routeEnterCmd)

import Backend.HttpCommands exposing (leaderBoard)
import Browser.Navigation exposing (Key)
import Types exposing (Model, Msg, Route(..), StaticPage(..))
import Url exposing (Url, percentDecode)
import Url.Parser exposing (..)


parseLocation : Url -> Route
parseLocation url =
    parse matchers url
        |> Maybe.withDefault NotFoundRoute


matchers : Parser (Route -> a) a
matchers =
    oneOf
        [ map HomeRoute top
        , map StaticPageRoute (s "static" </> staticPageMatcher)
        , map MyProfileRoute (s "me")
        , map TokenRoute (s "token" </> string)
        , map ProfileRoute (s "profile" </> string)
        , map LeaderBoardRoute (s "leaderboard")
        , tableMatcher
        ]


staticPageMatcher : Parser (StaticPage -> a) a
staticPageMatcher =
    custom "STATIC_PAGE" <|
        \segment ->
            case segment of
                "help" ->
                    Just Help

                "about" ->
                    Just About

                "changelog" ->
                    Just Changelog

                _ ->
                    Nothing


tableMatcher : Parser (Route -> a) a
tableMatcher =
    custom "GAME" <|
        \segment ->
            percentDecode segment |> Maybe.map GameRoute


navigateTo : Bool -> Key -> Route -> Cmd Msg
navigateTo useHash key route =
    Browser.Navigation.pushUrl key <| routeToString useHash route


replaceNavigateTo : Bool -> Key -> Route -> Cmd Msg
replaceNavigateTo useHash key route =
    Browser.Navigation.replaceUrl key <| routeToString useHash route


routeToString : Bool -> Route -> String
routeToString useHash route =
    (if useHash then
        "#"

     else
        ""
    )
        ++ (case route of
                HomeRoute ->
                    ""

                GameRoute table ->
                    table

                StaticPageRoute page ->
                    case page of
                        Help ->
                            "static/help"

                        About ->
                            "static/about"

                        Changelog ->
                            "static/changelog"

                NotFoundRoute ->
                    "404"

                MyProfileRoute ->
                    "me"

                TokenRoute token ->
                    "token/" ++ token

                ProfileRoute id ->
                    "profile/" ++ id

                LeaderBoardRoute ->
                    "leaderboard"
           )


routeEnterCmd : Model -> Route -> Cmd Msg
routeEnterCmd model route =
    case route of
        LeaderBoardRoute ->
            leaderBoard model.backend

        _ ->
            Cmd.none


goToBestTable : Model -> Cmd Msg
goToBestTable model =
    case List.head <| List.filter hasSomePlayers model.tableList of
        Just bestTable ->
            replaceNavigateTo model.zip model.key <| GameRoute bestTable.table

        Nothing ->
            replaceNavigateTo model.zip model.key <| GameRoute "España"


hasSomePlayers table =
    table.playerCount > 0


fragmentUrl : Url -> Url
fragmentUrl =
    fixPathQuery << pathFromFragment


pathFromFragment : Url -> Url
pathFromFragment url =
    { url | path = Maybe.withDefault "" url.fragment, fragment = Nothing }


fixPathQuery : Url -> Url
fixPathQuery url =
    let
        ( newPath, newQuery ) =
            case String.split "?" url.path of
                path :: query :: _ ->
                    ( path, Just query )

                _ ->
                    ( url.path, url.query )
    in
    { url | path = newPath, query = newQuery }
