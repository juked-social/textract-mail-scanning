export type Mail = {
    malId: number,
    assignedDate: Date,
    lastActionDate: Date,
    currentStatus: string,
    imageUrl: string,
    refKey: string
}

export type AnytimeMailBox = {
    malId: number,
    message: string,
    messageColor: string,
    imageUrl: string,
    imageVersion: number,
    date: Date,
    timeZoneText: string,
    creationDate: string,
    creationDate_utc: Date,
    assignedDate: string,
    assignedDate_utc: Date,
    lastActionDate: string,
    lastActionDate_utc: Date
    status: string
    currentStatusId: number,
    currentStatus: string,
    pastStatus: string,
    isNeedLoadDetail: boolean,
    senderDetails: string,
    read: number,
    title: string,
    refKey: string,
    pages: number,
    actions: number,
    folder: number,
    version: number,
    timestamp: number,
    metadata: null
}