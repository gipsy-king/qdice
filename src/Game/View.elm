module Game.View exposing (view)

import Game.Types exposing (PlayerAction(..), TableInfo)
import Game.State exposing (findUserPlayer)
import Game.Chat
import Game.Footer exposing (footer)
import Game.PlayerCard as PlayerCard
import Html
import Html.Attributes exposing (class, style)
import Material
import Material.Options as Options
import Material.Button as Button
import Material.Icon as Icon
import Material.Footer as Footer
import Material.List as Lists
import Types exposing (Model, Msg(..))
import Tables exposing (Table, tableList, encodeTable)
import Board
import Backend.Types exposing (ConnectionStatus(..))
import Time exposing (inMilliseconds)


view : Model -> Html.Html Types.Msg
view model =
    let
        board =
            Board.view model.game.board
                |> Html.map BoardMsg
    in
        Html.div [ class "edGame" ]
            [ header model
            , board
            , Html.div [ class "edGame__meta" ]
                [ Html.div [ class "edPlayerChips" ] <| List.indexedMap (PlayerCard.view model) model.game.players
                , gameChat model
                ]
            , gameLogOverlay model
            , footer model
            ]


header : Model -> Html.Html Types.Msg
header model =
    Html.div [ class "edGameHeader" ]
        [ seatButton model
        , Html.div [ class "edGameHeader__tableStatus" ]
            [ Html.span [ class "edGameHeader__chip" ]
                [ Html.text "Table "
                , Html.span [ class "edGameHeader__chip--strong" ]
                    [ Html.text <| encodeTable model.game.table
                    ]
                ]
            , Html.span [ class "edGameHeader__chip" ] <|
                List.append
                    [ Html.text ", "
                    , Html.span [ class "edGameHeader__chip--strong" ]
                        [ Html.text <|
                            (if model.game.playerSlots == 0 then
                                "∅"
                             else
                                toString model.game.playerSlots
                            )
                        ]
                    , Html.text " player game is "
                    , Html.span [ class "edGameHeader__chip--strong" ]
                        [ Html.text <| toString model.game.status ]
                    ]
                    (case model.game.gameStart of
                        Nothing ->
                            []

                        Just timestamp ->
                            [ Html.text " starting in "
                            , Html.span [ class "edGameHeader__chip--strong" ]
                                [ Html.text <| (toString (round <| (toFloat timestamp) - (inMilliseconds model.time / 1000))) ++ "s" ]
                            ]
                    )
            ]
        , endTurnButton model
        ]


seatButton : Model -> Html.Html Types.Msg
seatButton model =
    let
        canPlay =
            case model.backend.status of
                Online ->
                    True

                _ ->
                    False

        player =
            findUserPlayer model.user model.game.players

        ( label, onClick ) =
            case player of
                Just player ->
                    (if model.game.status == Game.Types.Playing then
                        (if player.out then
                            ( "Sit in", Options.onClick <| GameCmd SitIn )
                         else
                            ( "Sit out", Options.onClick <| GameCmd SitOut )
                        )
                     else
                        ( "Leave", Options.onClick <| GameCmd Leave )
                    )

                Nothing ->
                    case model.user of
                        Types.Anonymous ->
                            ( "Join", Options.onClick <| ShowLogin True )

                        Types.Logged user ->
                            ( "Join", Options.onClick <| GameCmd Join )
    in
        Button.render
            Types.Mdl
            [ 1 ]
            model.mdl
            (onClick
                :: [ Button.raised
                   , Button.colored
                   , Button.ripple
                   , Options.cs "edGameHeader__button"
                   , Options.disabled <| not canPlay
                   ]
            )
            [ Html.text label ]


endTurnButton : Model -> Html.Html Types.Msg
endTurnButton model =
    Button.render
        Types.Mdl
        [ 1 ]
        model.mdl
        [ Button.colored
        , Button.ripple
        , Options.cs "edGameHeader__button"
        , Options.onClick <| GameCmd EndTurn
        , Options.disabled <| not model.game.hasTurn
        ]
        [ Html.text "End turn" ]


gameLogOverlay : Model -> Html.Html Types.Msg
gameLogOverlay model =
    Game.Chat.gameBox
        model.mdl
        model.game.gameLog
    <|
        "gameLog-"
            ++ (toString model.game.table)


gameChat : Model -> Html.Html Types.Msg
gameChat model =
    Html.div [ class "chatboxContainer" ]
        [ Game.Chat.chatBox
            (not model.isTelegram)
            model.game.chatInput
            model.mdl
            model.game.chatLog
          <|
            "chatLog-"
                ++ (toString model.game.table)
        ]


isPlayerInGame : Model -> Bool
isPlayerInGame model =
    case model.user of
        Types.Anonymous ->
            False

        Types.Logged user ->
            List.map (.id) model.game.players
                |> List.any (\id -> id == user.id)
