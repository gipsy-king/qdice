module LeaderBoard.View exposing (view)

import Helpers exposing (pointsSymbol)
import Html exposing (..)
import Html.Attributes exposing (align, class, href)
import Routing exposing (routeToString)
import Types exposing (..)


view : Int -> Model -> Html Msg
view limit model =
    div [ class "edLeaderboard" ]
        [ div []
            [ a
                [ href "/leaderboard"
                ]
                [ text "Leaderboard" ]
            , text <| " for " ++ model.leaderBoard.month
            ]
        , table []
            [ thead []
                [ tr []
                    [ th [ align "right" ] [ text "Rank" ]
                    , th [ align "left" ] [ text "Name" ]
                    , th [ align "right" ] [ text "Points" ]
                    , th [ align "right" ] [ text "Level" ]
                    ]
                ]
            , model.leaderBoard.top
                |> List.take limit
                |> List.map
                    (\profile ->
                        tr []
                            [ td [ align "right" ] [ text <| String.fromInt profile.rank ]
                            , td [ align "left" ]
                                [ a [ href <| routeToString False <| ProfileRoute profile.id profile.name ]
                                    [ text profile.name
                                    ]
                                ]
                            , td [ align "right" ] [ text <| String.fromInt profile.points ++ pointsSymbol ]
                            , td [ align "right" ] [ text <| String.fromInt profile.level ]
                            ]
                    )
                |> tbody []
            ]
        ]
