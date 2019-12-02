module Types exposing (AuthNetwork(..), AuthState, GlobalSettings, LoggedUser, LoginDialogStatus(..), Model, Msg(..), MyOAuthModel, Profile, Route(..), StaticPage(..), User(..), UserId, Username, getUsername)

import Animation
import Backend.Types
import Board
import Browser
import Browser.Navigation exposing (Key)
import Game.Types exposing (PlayerAction, TableInfo)
import Http exposing (Error)
import MyProfile.Types
import OAuth
import Tables exposing (Table)
import Time
import Url exposing (Url)


type Msg
    = NavigateTo Route
    | OnLocationChange Url
    | OnUrlRequest Browser.UrlRequest
    | Tick Time.Posix
    | Animate Animation.Msg
    | MyProfileMsg MyProfile.Types.MyProfileMsg
    | ErrorToast String String
    | RequestFullscreen
    | RequestNotifications
      -- oauth
    | Nop
    | GetGlobalSettings (Result Error ( GlobalSettings, List TableInfo ))
    | Authorize AuthState
    | Authenticate String AuthState
    | GetToken (Maybe AuthState) (Result Error String)
    | GetProfile (Result Error ( LoggedUser, String ))
    | GetLeaderBoard (Result Error ( String, List Profile ))
    | Logout
    | ShowLogin LoginDialogStatus
    | Login String
    | SetLoginName String
    | UpdateUser LoggedUser String
      -- game
    | BoardMsg Board.Msg
    | InputChat String
    | SendChat String
    | GameCmd PlayerAction
    | EnterGame Table
      -- backend
    | Connected Backend.Types.ClientId
    | StatusConnect String
    | StatusReconnect Int
    | StatusOffline String
    | StatusError String
    | Subscribed Backend.Types.Topic
    | ClientMsg Backend.Types.ClientMessage
    | AllClientsMsg Backend.Types.AllClientsMessage
    | TableMsg Table Backend.Types.TableMessage
    | UnknownTopicMessage String String String
    | SetLastHeartbeat Time.Posix


type alias AuthState =
    { network : AuthNetwork
    , table : Maybe Table
    , addTo : Maybe UserId
    }


type StaticPage
    = Help
    | About


type Route
    = HomeRoute
    | GameRoute Table
    | StaticPageRoute StaticPage
    | NotFoundRoute
    | MyProfileRoute
    | TokenRoute String
    | ProfileRoute String
    | LeaderBoardRoute


type alias Model =
    { route : Route
    , key : Key
    , oauth : MyOAuthModel
    , game : Game.Types.Model
    , myProfile : MyProfile.Types.MyProfileModel
    , backend : Backend.Types.Model
    , user : User
    , tableList : List TableInfo
    , time : Time.Posix
    , isTelegram : Bool
    , screenshot : Bool
    , loginName : String
    , showLoginDialog : LoginDialogStatus
    , settings : GlobalSettings
    , staticPage :
        { help :
            { tab : Int }
        , leaderBoard :
            { month : String
            , top : List Profile
            }
        }
    }


type User
    = Anonymous
    | Logged LoggedUser


type alias LoggedUser =
    { id : UserId
    , name : Username
    , email : Maybe String
    , picture : String
    , points : Int
    , level : Int
    , claimed : Bool
    , networks : List AuthNetwork
    }


type AuthNetwork
    = Password
    | Google
    | Reddit
    | Telegram


type alias MyOAuthModel =
    { redirectUri : Url
    , error : Maybe String
    , token : Maybe OAuth.Token
    , state : String
    }


getUsername : Model -> String
getUsername model =
    case model.user of
        Anonymous ->
            "Anonymous"

        Logged user ->
            user.name


type alias UserId =
    String


type alias Username =
    String


type alias GlobalSettings =
    { gameCountdownSeconds : Int
    , maxNameLength : Int
    , turnSeconds : Int
    }


type LoginDialogStatus
    = LoginShow
    | LoginShowJoin
    | LoginHide


type alias Profile =
    { id : UserId
    , name : Username
    , rank : Int
    , picture : String
    , points : Int
    , level : Int
    }