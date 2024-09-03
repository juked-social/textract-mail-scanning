export type Mail = {
    any_mail_id: number,
    message: string,
    image_path: string,
    reason?: string,
    note?: string,
    code?: string,
    email?: string,
    user_full_name?: string,
    address?: string,
    is_valid?: boolean,
    handwritten_confidence?: number,
    creationDate: string,
    assignedDate: string,
    lastActionDate: string,
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

export type AnytimeMailPageInfo = {
    isLastPage: boolean,
    refTimestamp: number,
    mailList: Mail[]
}
